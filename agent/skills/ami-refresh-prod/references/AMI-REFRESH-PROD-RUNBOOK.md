# Production AMI Refresh Runbook
## Applies to: SITE_A, SITE_B, SITE_C

**Last updated:** 2026-10-30  
**Based on:** ADO-393 production execution (SITE_A, 2026-10-30)

---

## Project Reference Table

| Project | AWS Profile | Account | SSM Parameter | Jenkins Folder | Jenkins Job |
|---------|------------|---------|---------------|----------------|-------------|
| SITE_A | `site-a` | `<ACCOUNT_ID>` | `/org/site-a/PROD/ami/latest` | `SITE_A` | `site-a-ami-refresh-prod` |
| SITE_B | `site-b` | `<ACCOUNT_ID>` | `/org/site-b/PROD/ami/latest` | `SITE_B` | `site-b-ami-refresh-prod` |
| SITE_C | `site-c` | `<ACCOUNT_ID>` | `/org/site-c/PROD/ami/latest` | `SITE_C-Drupal` | `site-c-ami-refresh-prod` |

**ASG Names:**

| Project | Live ASG | Blue ASG |
|---------|----------|----------|
| SITE_A | `SITE_A-Prod-ASG` | `SITE_A-Prod-Blue-ASG` |
| SITE_B | `SITE_B-Prod-ASG` | `SITE_B-Prod-Blue-ASG` |
| SITE_C | `SITE_C-Prod-ASG` | `SITE_C-Prod-Blue-ASG` |

*(Verify ASG names in `devops/drupal-deploy/<project>/settings.yml` under the `prod:` section if unsure)*

---

## Prerequisites

- VPN connected
- Kion session active: `aws sts get-caller-identity --profile <profile>` (re-auth if expired)
- Jenkins env file: `/Users/dietrichgottfriedschmidt/apps/devops/jenkins-config-sync/.env`
- AMI validated on staging first (run staging ami-refresh, verify instances healthy)

---

## Step 0 — Identify the Target AMI

```bash
# Find latest Image Builder AMIs (self-owned, stig-ami naming)
aws ec2 describe-images \
  --profile <profile> \
  --region us-east-1 \
  --owners self \
  --filters "Name=name,Values=*stig-ami*" \
  --query 'sort_by(Images, &CreationDate)[-5:].{ImageId:ImageId,Name:Name,CreationDate:CreationDate,State:State}' \
  --output table
```

**Decision rule:**
- Use the AMI that was validated on staging (check ADO ticket for which build was used)
- If multiple AMIs exist from the same recipe/version (e.g., Run 1 vs Run 2), prefer the one explicitly stage-tested
- Confirm AMI name/recipe: `aws ec2 describe-images --image-ids <ami-id> --profile <profile> --query 'Images[0].{Name:Name,CreationDate:CreationDate,Tags:Tags}' --output json`

---

## Step 1 — Verify / Write SSM Parameter

```bash
# Check current value
aws ssm get-parameter \
  --name "/org/<project>/PROD/ami/latest" \
  --profile <profile> \
  --region us-east-1 \
  --query "Parameter.{Value:Value,LastModified:LastModifiedDate}" \
  --output table

# Write new value (only if different from target AMI)
aws ssm put-parameter \
  --name "/org/<project>/PROD/ami/latest" \
  --value "<ami-id>" \
  --type String \
  --overwrite \
  --profile <profile> \
  --region us-east-1
```

---

## Step 2 — Check for Stale Launch Configurations

```bash
aws autoscaling describe-launch-configurations \
  --profile <profile> \
  --region us-east-1 \
  --query 'LaunchConfigurations[?contains(LaunchConfigurationName, `<project>_prod`)].{Name:LaunchConfigurationName,AMI:ImageId,Created:CreatedTime}' \
  --output table
```

**Safe to proceed if:** no active ASG is currently using these LCs (they are stale from prior deploys).  
**Cleanup:** delete stale LCs after the refresh completes (see Step 8).

---

## Step 3 — Trigger Phase A: Blue Instance Refresh

```bash
# Load Jenkins credentials
set -a && source /Users/dietrichgottfriedschmidt/apps/devops/jenkins-config-sync/.env && set +a

# Get CSRF crumb
CRUMB=$(curl -s -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "$JENKINS_URL/crumbIssuer/api/json" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['crumbRequestField']+':'+d['crumb'])")

# Trigger blue job — NOTE: parameter name is RELEASE_TYPE_OVERRIDE (not RELEASE_TYPE)
curl -s -X POST \
  -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  -H "$CRUMB" \
  "$JENKINS_URL/job/<FOLDER>/job/<JOB>/buildWithParameters?RELEASE_TYPE_OVERRIDE=blue" \
  -w "\nHTTP: %{http_code}\n"
```

Expected response: `HTTP: 201`

---

## Step 4 — Poll for Build Completion

```bash
# Get latest build number
curl -s -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "$JENKINS_URL/job/<FOLDER>/job/<JOB>/lastBuild/api/json?tree=number,result,building,duration" \
  -w "\nHTTP: %{http_code}\n"

# Poll in a loop
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

**Expected duration:** ~12–15 min (blue, 1 instance) | ~25–35 min (live, 2–6 instances)

---

## Step 5 — Validate Blue ASG

```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "<Blue-ASG-Name>" \
  --profile <profile> \
  --region us-east-1 \
  --query 'AutoScalingGroups[0].{ASG:AutoScalingGroupName,LC:LaunchConfigurationName,DesiredCapacity:DesiredCapacity,Instances:Instances[*].{ID:InstanceId,State:LifecycleState,Health:HealthStatus}}' \
  --output json

# Confirm new LC is on target AMI
aws autoscaling describe-launch-configurations \
  --launch-configuration-names "<new-lc-name>" \
  --profile <profile> \
  --region us-east-1 \
  --query 'LaunchConfigurations[0].{Name:LaunchConfigurationName,AMI:ImageId}' \
  --output table
```

**Pass criteria:** all instances `InService`, `Healthy`, LC AMI = target AMI.

---

## Step 6 — Blue Smoke Test (REQUIRED before live trigger)

```bash
# Get blue instance ID from Step 5 output, then:
CMD_ID=$(aws ssm send-command \
  --instance-ids <blue-instance-id> \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":[
    "echo \"=== $(hostname) ===\"",
    "docker ps --format \"{{.Names}} | {{.Status}}\" 2>/dev/null | grep -i drupal",
    "docker logs $(docker ps -q --filter name=drupal 2>/dev/null | head -1) --tail 20 2>&1 | grep -iE \"error|fatal|critical\" | head -10 || echo \"no errors\""
  ]}' \
  --profile <profile> \
  --region us-east-1 \
  --query 'Command.CommandId' \
  --output text)

sleep 10

aws ssm get-command-invocation \
  --command-id "$CMD_ID" \
  --instance-id <blue-instance-id> \
  --profile <profile> \
  --region us-east-1 \
  --query '{Status:Status,Output:StandardOutputContent}' \
  --output json
```

**Pass criteria:**
- SSM Status: `Success`
- Container `<project>-drupal-web` shows `Up X minutes`
- No `ERROR`, `FATAL`, or `CRITICAL` in Docker logs

**STOP here if smoke test fails.** Do not proceed to live until blue is healthy.

---

## Step 7 — Trigger Phase B: Live Instance Refresh

```bash
curl -s -X POST \
  -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  -H "$CRUMB" \
  "$JENKINS_URL/job/<FOLDER>/job/<JOB>/buildWithParameters?RELEASE_TYPE_OVERRIDE=live" \
  -w "\nHTTP: %{http_code}\n"
```

**NOTE:** Use `RELEASE_TYPE_OVERRIDE=live` — NOT `RELEASE_TYPE=live`. The Jenkins job parameter name is `RELEASE_TYPE_OVERRIDE`.

Poll for completion using the same loop from Step 4.

---

## Step 8 — Validate Live ASG + Smoke Test

```bash
# Validate live ASG
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "<Live-ASG-Name>" \
  --profile <profile> \
  --region us-east-1 \
  --query 'AutoScalingGroups[0].{ASG:AutoScalingGroupName,LC:LaunchConfigurationName,DesiredCapacity:DesiredCapacity,Instances:Instances[*].{ID:InstanceId,State:LifecycleState,Health:HealthStatus}}' \
  --output json

# Smoke test all live instances (pass space-separated instance IDs)
CMD_ID=$(aws ssm send-command \
  --instance-ids <id1> <id2> \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":[
    "echo \"=== $(hostname) ===\"",
    "docker ps --format \"{{.Names}} | {{.Status}}\" 2>/dev/null | grep -i drupal",
    "docker logs $(docker ps -q --filter name=drupal 2>/dev/null | head -1) --tail 20 2>&1 | grep -iE \"error|fatal|critical\" | head -10 || echo \"no errors\""
  ]}' \
  --profile <profile> \
  --region us-east-1 \
  --query 'Command.CommandId' \
  --output text)

sleep 10

for INST in <id1> <id2>; do
  echo "--- $INST ---"
  aws ssm get-command-invocation \
    --command-id "$CMD_ID" \
    --instance-id "$INST" \
    --profile <profile> \
    --region us-east-1 \
    --query '{Status:Status,Output:StandardOutputContent}' \
    --output json
done
```

---

## Step 9 — Post-run LC Cleanup

```bash
# List all stale LCs for this project on the OLD AMI
aws autoscaling describe-launch-configurations \
  --profile <profile> \
  --region us-east-1 \
  --query 'LaunchConfigurations[?contains(LaunchConfigurationName, `<project>_prod`) && ImageId==`<old-ami-id>`].LaunchConfigurationName' \
  --output text

# Delete them
STALE_LCS=("lc-name-1" "lc-name-2" ...)
for LC in "${STALE_LCS[@]}"; do
  aws autoscaling delete-launch-configuration \
    --launch-configuration-name "$LC" \
    --profile <profile> \
    --region us-east-1 && echo "DELETED: $LC" || echo "FAILED: $LC"
done
```

**Safety:** only delete LCs that are NOT currently attached to any ASG.

---

## Known Issues / Lessons Learned

### 1. `ami-refresh-entry.sh` awk bug (fixed PR #92, 2026-10-30)
- **Symptom:** `ERROR: Could not extract live ASG name from ./devops/drupal-deploy/<project>/settings.yml`
- **Fix:** PR #92 merged — replaced broken `awk` range with `python3 yaml.safe_load()`. Should not recur.
- **If it recurs:** check that the Jenkins job is checking out the latest `main` branch of `web-services-devops`.

### 2. Jenkins parameter name
- The Jenkins choice parameter is `RELEASE_TYPE_OVERRIDE` — NOT `RELEASE_TYPE`
- Always use `buildWithParameters?RELEASE_TYPE_OVERRIDE=blue` or `=live`

### 3. Health check HTTP 000 on blue instance
- Blue instances are not behind the public load balancer — `curl localhost/health-check.txt` returns `000`
- This is expected. Use Docker container status as the health signal instead.

### 4. AMI run variants (-1 vs -2 suffix in name)
- Image Builder may produce multiple runs of the same recipe version (e.g., `stig-ami-20260730-1` vs `-2`)
- Always use the AMI that was explicitly validated on staging, regardless of which run number it is
- Check the `Ec2ImageBuilderArn` tag — same recipe ARN with `/1` vs `/2` = same content, different runs

### 5. VPN required for Jenkins polling
- `<JENKINS_HOST>` is internal-only — VPN must be active for all curl commands
- Exit code 52 (empty reply) = VPN dropped, not an auth issue

---

## Rollback Procedure

If either blue or live smoke test fails:

1. **Note the old LC name** from before the refresh (it will still exist until cleanup)
2. **Revert ASG to old LC:**
   ```bash
   aws autoscaling update-auto-scaling-group \
     --auto-scaling-group-name "<ASG-Name>" \
     --launch-configuration-name "<old-lc-name>" \
     --profile <profile> \
     --region us-east-1
   ```
3. **Start instance refresh** to roll back instances to the old AMI:
   ```bash
   aws autoscaling start-instance-refresh \
     --auto-scaling-group-name "<ASG-Name>" \
     --profile <profile> \
     --region us-east-1
   ```
4. **Revert SSM parameter** to the old AMI ID
5. **Notify team** and open incident ticket

---

## Sequential Order for Multi-Site Refresh

Execute one project fully (blue + live + validate) before starting the next:

1. **SITE_A** (profile: `site-a`, account: `<ACCOUNT_ID>`)
2. **SITE_B** (profile: `site-b`, account: `<ACCOUNT_ID>`)
3. **SITE_C** (profile: `site-c`, account: `<ACCOUNT_ID>`)
