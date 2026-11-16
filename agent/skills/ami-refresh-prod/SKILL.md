---
name: ami-refresh-prod
description: Execute a production AMI refresh for SITE_A, SITE_B, or SITE_C Drupal sites using the blue-green instance refresh pipeline. This skill should be used when a user asks to run a production AMI refresh, refresh prod instances to a new AMI, deploy a new AMI to production, or rotate EC2 instances in the production ASG for any of the three Drupal projects. Covers all 9 phases: AMI identification, SSM verification, stale LC pre-flight, blue trigger, blue smoke test gate (required), live trigger, live validation, post-run LC cleanup, and rollback procedure.
---

# Production AMI Refresh Skill

Execute a production AMI refresh for SITE_A, SITE_B, or SITE_C using the Jenkins blue-green pipeline.

## Pre-Execution Checklist

Before starting, verify:
1. VPN connected (`curl -s $JENKINS_URL` must respond — exit 52 = VPN dropped)
2. Kion session active: `aws sts get-caller-identity --profile <profile>` — re-auth if expired
3. Target AMI was validated on staging first (check ADO ticket)
4. Jenkins env loaded: `set -a && source /Users/dietrichgottfriedschmidt/apps/devops/jenkins-config-sync/.env && set +a`

## Project Quick Reference

| Project | Profile | Jenkins Folder/Job | Live ASG | Blue ASG |
|---------|---------|-------------------|----------|----------|
| SITE_A | `site-a` | `SITE_A/site-a-ami-refresh-prod` | `SITE_A-Prod-ASG` | `SITE_A-Prod-Blue-ASG` |
| SITE_B | `site-b` | `SITE_B/site-b-ami-refresh-prod` | `SITE_B-Prod-ASG` | `SITE_B-Prod-Blue-ASG` |
| SITE_C | `site-c` | `SITE_C-Drupal/site-c-ami-refresh-prod` | `SITE_C-Prod-ASG` | `SITE_C-Prod-Blue-ASG` |

SSM paths: `/org/<project>/PROD/ami/latest` (e.g. `/org/site-a/PROD/ami/latest`)

## Execution Flow

### Phase 0: Identify Target AMI
Find the stage-validated AMI:
```bash
aws ec2 describe-images \
  --profile <profile> --region us-east-1 --owners self \
  --filters "Name=name,Values=*stig-ami*" \
  --query 'sort_by(Images, &CreationDate)[-5:].{ImageId:ImageId,Name:Name,CreationDate:CreationDate}' \
  --output table
```
Use the AMI that was explicitly stage-tested. If multiple runs of same recipe exist, prefer the one documented in the ADO ticket.

### Phase 1: Verify/Write SSM Parameter
```bash
aws ssm get-parameter --name "/org/<project>/PROD/ami/latest" \
  --profile <profile> --region us-east-1 \
  --query "Parameter.{Value:Value,LastModified:LastModifiedDate}" --output table

# Only write if different from target:
aws ssm put-parameter --name "/org/<project>/PROD/ami/latest" \
  --value "<ami-id>" --type String --overwrite \
  --profile <profile> --region us-east-1
```

### Phase 2: Pre-flight — Check Stale LCs
```bash
aws autoscaling describe-launch-configurations \
  --profile <profile> --region us-east-1 \
  --query 'LaunchConfigurations[?contains(LaunchConfigurationName, `<project>_prod`)].{Name:LaunchConfigurationName,AMI:ImageId}' \
  --output table
```
Note any LCs on the old AMI — delete them in Phase 9 after the refresh completes.

### Phase 3: Trigger Blue
```bash
CRUMB=$(curl -s -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "$JENKINS_URL/crumbIssuer/api/json" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['crumbRequestField']+':'+d['crumb'])")

curl -s -X POST -u "$JENKINS_USER:$JENKINS_API_TOKEN" -H "$CRUMB" \
  "$JENKINS_URL/job/<FOLDER>/job/<JOB>/buildWithParameters?RELEASE_TYPE_OVERRIDE=blue" \
  -w "\nHTTP: %{http_code}\n"
```
**CRITICAL:** Parameter name is `RELEASE_TYPE_OVERRIDE` — NOT `RELEASE_TYPE`.

Expected: `HTTP: 201`

### Phase 4: Poll Blue Build (~12–15 min)
```bash
BUILD_NUM=<N>
while true; do
  R=$(curl -s -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
    "$JENKINS_URL/job/<FOLDER>/job/<JOB>/${BUILD_NUM}/api/json?tree=number,result,building,duration")
  BUILDING=$(echo $R | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['building'])" 2>/dev/null)
  RESULT=$(echo $R | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'])" 2>/dev/null)
  ELAPSED=$(echo $R | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['duration']//60000)" 2>/dev/null)
  echo "$(date -u +%H:%M:%S) building=$BUILDING result=$RESULT elapsed=${ELAPSED}min"
  if [ "$BUILDING" = "False" ]; then break; fi
  sleep 60
done
```

### Phase 5: Validate Blue ASG
```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "<Blue-ASG>" \
  --profile <profile> --region us-east-1 \
  --query 'AutoScalingGroups[0].{ASG:AutoScalingGroupName,LC:LaunchConfigurationName,Instances:Instances[*].{ID:InstanceId,State:LifecycleState,Health:HealthStatus}}' \
  --output json

# Confirm LC AMI:
aws autoscaling describe-launch-configurations \
  --launch-configuration-names "<lc-name>" \
  --profile <profile> --region us-east-1 \
  --query 'LaunchConfigurations[0].{Name:LaunchConfigurationName,AMI:ImageId}' --output table
```
Pass criteria: all instances `InService`/`Healthy`, LC AMI = target AMI.

### Phase 6: Blue Smoke Test (REQUIRED GATE — do not skip)
```bash
BLUE_INSTANCE_ID=<id-from-phase-5>

CMD_ID=$(aws ssm send-command \
  --instance-ids "$BLUE_INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":[
    "echo \"=== $(hostname) ===\"",
    "docker ps --format \"{{.Names}} | {{.Status}}\" 2>/dev/null | grep -i drupal",
    "docker logs $(docker ps -q --filter name=drupal 2>/dev/null | head -1) --tail 20 2>&1 | grep -iE \"error|fatal|critical\" | head -10 || echo \"no errors\""
  ]}' \
  --profile <profile> --region us-east-1 \
  --query 'Command.CommandId' --output text)

sleep 10

aws ssm get-command-invocation --command-id "$CMD_ID" \
  --instance-id "$BLUE_INSTANCE_ID" \
  --profile <profile> --region us-east-1 \
  --query '{Status:Status,Output:StandardOutputContent}' --output json
```

**Pass criteria:**
- Status: `Success`
- Container `<project>-drupal-web` shows `Up X minutes`
- No `ERROR`, `FATAL`, `CRITICAL` in Docker logs

**STOP if smoke test fails.** Do not proceed to live.

**Note:** HTTP `000` from `curl localhost/health-check.txt` is expected on blue — the blue instance is not on the public LB. Use Docker container status as the health signal.

### Phase 7: Trigger Live (~25–35 min for 2–6 instances)
```bash
curl -s -X POST -u "$JENKINS_USER:$JENKINS_API_TOKEN" -H "$CRUMB" \
  "$JENKINS_URL/job/<FOLDER>/job/<JOB>/buildWithParameters?RELEASE_TYPE_OVERRIDE=live" \
  -w "\nHTTP: %{http_code}\n"
```

Poll using the same loop from Phase 4.

### Phase 8: Validate Live ASG + Smoke Test All Instances
```bash
# Validate live ASG
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "<Live-ASG>" \
  --profile <profile> --region us-east-1 \
  --query 'AutoScalingGroups[0].{ASG:AutoScalingGroupName,LC:LaunchConfigurationName,Instances:Instances[*].{ID:InstanceId,State:LifecycleState,Health:HealthStatus}}' \
  --output json

# Smoke test all live instances:
CMD_ID=$(aws ssm send-command \
  --instance-ids <id1> <id2> \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":[
    "echo \"=== $(hostname) ===\"",
    "docker ps --format \"{{.Names}} | {{.Status}}\" 2>/dev/null | grep -i drupal",
    "docker logs $(docker ps -q --filter name=drupal 2>/dev/null | head -1) --tail 20 2>&1 | grep -iE \"error|fatal|critical\" | head -10 || echo \"no errors\""
  ]}' \
  --profile <profile> --region us-east-1 \
  --query 'Command.CommandId' --output text)

sleep 10

for INST in <id1> <id2>; do
  echo "--- $INST ---"
  aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INST" \
    --profile <profile> --region us-east-1 \
    --query '{Status:Status,Output:StandardOutputContent}' --output json
done
```

### Phase 9: Post-run LC Cleanup
```bash
# List stale LCs on the OLD AMI
aws autoscaling describe-launch-configurations \
  --profile <profile> --region us-east-1 \
  --query 'LaunchConfigurations[?contains(LaunchConfigurationName, `<project>_prod`) && ImageId==`<old-ami-id>`].LaunchConfigurationName' \
  --output text

# Delete each
STALE_LCS=("lc1" "lc2" ...)
for LC in "${STALE_LCS[@]}"; do
  aws autoscaling delete-launch-configuration \
    --launch-configuration-name "$LC" \
    --profile <profile> --region us-east-1 && echo "DELETED: $LC" || echo "FAILED: $LC"
done
```

## Rollback Procedure

If smoke test fails after live trigger:
```bash
# 1. Revert ASG to old LC
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name "<Live-ASG>" \
  --launch-configuration-name "<old-lc-name>" \
  --profile <profile> --region us-east-1

# 2. Start instance refresh to roll back instances
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name "<Live-ASG>" \
  --profile <profile> --region us-east-1

# 3. Revert SSM parameter to old AMI
aws ssm put-parameter --name "/org/<project>/PROD/ami/latest" \
  --value "<old-ami-id>" --type String --overwrite \
  --profile <profile> --region us-east-1
```

## Known Issues

| Issue | Detail |
|-------|--------|
| `RELEASE_TYPE` ignored | Jenkins param is `RELEASE_TYPE_OVERRIDE` — `RELEASE_TYPE=live` silently runs blue |
| exit 52 (empty reply) | VPN dropped — reconnect and retry |
| Health check `000` on blue | Expected — blue not on public LB, use Docker status instead |
| AMI run variants | Use stage-validated AMI regardless of `-1` vs `-2` run suffix |
| `ami-refresh-entry.sh` awk bug | Fixed in PR #92 (2026-10-30) — if recurs, confirm Jenkins checks out latest `main` of `web-services-devops` |

## Multi-Site Order

Execute one project fully (blue → live → validate → cleanup) before starting the next:
1. SITE_A (`site-a` profile)
2. SITE_B (`site-b` profile)
3. SITE_C (`site-c` profile)

## Reference

Full runbook with all commands: `references/AMI-REFRESH-PROD-RUNBOOK.md`
