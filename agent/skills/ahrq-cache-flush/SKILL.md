---
name: ahrq-cache-flush
description: Clear Drupal cache for AHRQ, EHC, and PSO production sites via SSM
---

# AHRQ Cache Flush Skill

## Overview

Clear Drupal cache tags (per-node surgical clearing) or full cache rebuild across AHRQ, EHC, and PSO production environments. Uses AWS SSM via Jenkins SSH tunnel to execute `drush cache:tag` commands inside Docker containers.

## Prerequisites

- **Local access:** SSH to Jenkins jumphost (`ahrq-jenkins-03.ahrq.local`)
- **Jenkins user:** `ahrqgovjenkins.deploy@ahrq.local` (service account with AWS credentials)
- **Network:** Access to AHRQ local DNS domain
- **No direct AWS IAM required:** Jenkins service account holds the credentials

## Production Environments

### AHRQ (Account: 406380712964)

| ASG Tag | Purpose |
|---------|---------|
| `AHRQ-Prod-ASG` | Production (live) |
| `AHRQ-Prod-Blue-ASG` | Production blue (pre-promotion) |
| `AHRQ-Stage-ASG` | Staging (live) |
| `AHRQ-Stage-Blue-ASG` | Staging blue |

- **Container:** `ahrqgov-drupal-web`
- **Profile:** default (no `--profile` needed)

### EHC (Account: 975242026693)

| ASG Tag | Purpose |
|---------|---------|
| `EHC-Prod-ASG` | Production (live) |
| `EHC-Prod-Blue-ASG` | Production blue (pre-promotion) |
| `EHC-Stage-ASG` | Staging (live) |
| `EHC-Stage-Blue-ASG` | Staging blue |

- **Container:** `ehc-drupal-web`
- **Profile:** `--profile EHCDeploy` (required)

### PSO (Account: 225577488556)

| ASG Tag | Purpose |
|---------|---------|
| `PSO-Prod-ASG` | Production (live) |
| `PSO-Prod-Blue-ASG` | Production blue (pre-promotion) |
| `PSO-Stage-ASG` | Staging (live) |
| `PSO-Stage-Blue-ASG` | Staging blue |

- **Container:** `pso-drupal-web`
- **Profile:** `--profile PSODeploy` (required)

⚠️ **Instance IDs are dynamic** due to auto-scaling. Always discover current instances via tag-based lookup.

## Step 0: Discover Instance IDs

Instances are tagged with `aws:autoscaling:groupName` but may be detached from the ASG. Use `ec2 describe-instances` with tag filter (NOT `autoscaling describe-auto-scaling-groups`):

### For AHRQ
```bash
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ec2 describe-instances \
  --filters \"Name=tag:aws:autoscaling:groupName,Values=AHRQ-Prod-ASG\" \"Name=instance-state-name,Values=running\" \
  --region us-east-1 \
  --query \"Reservations[].Instances[].InstanceId\" \
  --output text'"
```

### For EHC
```bash
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ec2 describe-instances \
  --filters \"Name=tag:aws:autoscaling:groupName,Values=EHC-Prod-ASG\" \"Name=instance-state-name,Values=running\" \
  --region us-east-1 \
  --profile EHCDeploy \
  --query \"Reservations[].Instances[].InstanceId\" \
  --output text'"
```

### For PSO
```bash
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ec2 describe-instances \
  --filters \"Name=tag:aws:autoscaling:groupName,Values=PSO-Prod-ASG\" \"Name=instance-state-name,Values=running\" \
  --region us-east-1 \
  --profile PSODeploy \
  --query \"Reservations[].Instances[].InstanceId\" \
  --output text'"
```

Example output: `i-0xxxxx	i-0yyyyy`

Use the returned instance IDs in the cache-clear commands below.

## Command Syntax

### Pattern: SSH → Jenkins → AWS SSM → Docker → Drush

```bash
ssh -o StrictHostKeyChecking=no USER@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ssm send-command \
  --instance-ids INSTANCE_ID_1 INSTANCE_ID_2 \
  --document-name AWS-RunShellScript \
  --parameters commands=[\"sudo docker exec CONTAINER drush COMMAND\"] \
  --region us-east-1 \
  [--profile PROFILE] \
  --output json'"
```

## Recipes

### 1. Clear Cache for Specific Node (Surgical)

**For AHRQ (admin.ahrq.gov):**

```bash
# Discover instances
AHRQ_IDS="$(ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ec2 describe-instances \
  --filters \"Name=tag:aws:autoscaling:groupName,Values=AHRQ-Prod-ASG\" \"Name=instance-state-name,Values=running\" \
  --region us-east-1 --query \"Reservations[].Instances[].InstanceId\" --output text'")"

# Clear cache for node NID (replace NID)
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ssm send-command \
  --instance-ids $AHRQ_IDS \
  --document-name AWS-RunShellScript \
  --parameters commands=[\"sudo docker exec ahrqgov-drupal-web drush cache:tag node:NID\"] \
  --region us-east-1 --output json'"
```

**For EHC (effectivehealthcare-admin.ahrq.gov):**

```bash
# Discover instances
EHC_IDS="$(ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ec2 describe-instances \
  --filters \"Name=tag:aws:autoscaling:groupName,Values=EHC-Prod-ASG\" \"Name=instance-state-name,Values=running\" \
  --region us-east-1 --profile EHCDeploy --query \"Reservations[].Instances[].InstanceId\" --output text'")"

# Clear cache
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ssm send-command \
  --instance-ids $EHC_IDS \
  --document-name AWS-RunShellScript \
  --parameters commands=[\"sudo docker exec ehc-drupal-web drush cache:tag node:NID\"] \
  --region us-east-1 --profile EHCDeploy --output json'"
```

**For PSO:**

```bash
# Discover instances
PSO_IDS="$(ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ec2 describe-instances \
  --filters \"Name=tag:aws:autoscaling:groupName,Values=PSO-Prod-ASG\" \"Name=instance-state-name,Values=running\" \
  --region us-east-1 --profile PSODeploy --query \"Reservations[].Instances[].InstanceId\" --output text'")"

# Clear cache
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ssm send-command \
  --instance-ids $PSO_IDS \
  --document-name AWS-RunShellScript \
  --parameters commands=[\"sudo docker exec pso-drupal-web drush cache:tag node:NID\"] \
  --region us-east-1 --profile PSODeploy --output json'"
```

### 2. Clear Multiple Nodes in One Command

Combine multiple drush commands separated by commas:

```bash
--parameters commands=["sudo docker exec CONTAINER drush cache:tag node:111","sudo docker exec CONTAINER drush cache:tag node:222"]
```

### 3. Full Cache Rebuild (Nuclear Option)

Clears ALL cache bins (Redis + database). Use when surgical clearing doesn't work or asset aggregation is broken.

```bash
# Replace CONTAINER, ASG_TAG, and PROFILE for your environment
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ssm send-command \
  --instance-ids INSTANCE_IDS \
  --document-name AWS-RunShellScript \
  --parameters commands=[\"sudo docker exec CONTAINER drush cr\"] \
  --region us-east-1 [--profile PROFILE] --output json'"
```

### 4. Check Command Result

Retrieve results using the CommandId from the send-command response:

```bash
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ssm list-command-invocations \
  --command-id COMMAND_ID \
  --details \
  --region us-east-1 \
  [--profile PROFILE] \
  --output json'"
```

Expected success output:
```
"Status": "Success",
"Output": "[success] Invalidated tag(s): node:NID."
```

### 5. List Docker Containers (Verify Container Name)

```bash
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws ssm send-command \
  --instance-ids INSTANCE_ID \
  --document-name AWS-RunShellScript \
  --parameters commands=[\"sudo docker ps\"] \
  --region us-east-1 [--profile PROFILE] --output json'"
```

## AWS Profiles (Jenkins Service Account)

Available profiles on Jenkins (`ahrqgovjenkins.deploy` home):

| Profile | Environment | Account | ASG Tag |
|---------|-------------|---------|---------|
| `AHRQGOVDeploy` | AHRQ Production (default) | 406380712964 | `AHRQ-Prod-ASG` |
| `AHRQGOVStageDeploy` | AHRQ Staging | 406380712964 | `AHRQ-Stage-ASG` |
| `EHCDeploy` | EHC Production | 975242026693 | `EHC-Prod-ASG` |
| `EHCStageDeploy` | EHC Staging | 975242026693 | `EHC-Stage-ASG` |
| `PSODeploy` | PSO Production | 225577488556 | `PSO-Prod-ASG` |
| `PSOStageDeploy` | PSO Staging | 225577488556 | `PSO-Stage-ASG` |
| `DataSearchDeploy` | DataSearch | 795832541432 | — |
| `DexiDeploy` | Dexi | — | — |

## Container Names

| Environment | Container Name |
|-------------|---------------|
| AHRQ | `ahrqgov-drupal-web` |
| EHC | `ehc-drupal-web` |
| PSO | `pso-drupal-web` |

## Drush Cache Commands Reference

| Command | Scope | Disruption |
|---------|-------|------------|
| `drush cache:tag node:NID` | Single node | Minimal |
| `drush cache:tag view:frontpage` | Single view | Minimal |
| `drush cache:tag config:system.site` | Site config | Minimal |
| `drush cr` | ALL cache bins (Redis + DB) | Full rebuild |

## Key Learnings

1. **Use `ec2 describe-instances` NOT `autoscaling describe-auto-scaling-groups`:** Instances are tagged with `aws:autoscaling:groupName` but are detached from the ASG (ASG API shows 0 instances). Use EC2 tag filter instead.
2. **Correct Drush Command:** `drush cache:tag node:NID` (not `php:eval` with `\Drupal\Cache\Cache::invalidateTags()`)
3. **All Instances Required:** Cache must be cleared on ALL running instances (Redis is external ElastiCache but PHP opcode caches are local)
4. **Admin URLs Bypass CloudFront:** No CDN invalidation needed for `admin.ahrq.gov` or `effectivehealthcare-admin.ahrq.gov`
5. **No Direct SSM Access:** Local IAM role (`ct-ahrqgov-dev-role`) lacks SSM permissions; Jenkins SSH tunnel is required
6. **JSON Parameter Escaping:** Avoid Docker's `--format {{.Names}}` syntax in SSM commands; use plain `docker ps` instead
7. **Blue vs Live ASGs:** Each environment has a Blue ASG and a Live ASG. Clear cache on the correct one based on deployment state.

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `AccessDeniedException: ssm:StartSession` | Local IAM lacks SSM permissions | Use Jenkins SSH tunnel (this skill) |
| `AccessDeniedException: ssm:SendCommand` | Local IAM lacks SSM permissions | Use Jenkins SSH tunnel (this skill) |
| Empty instance list from discovery | ASG tag name wrong or no running instances | List all ASGs: `aws autoscaling describe-auto-scaling-groups --query "AutoScalingGroups[].AutoScalingGroupName"` |
| Pages still stale after `cache:tag` | CloudFront cache on public URL | Run CloudFront invalidation (see below) |
| `No such container` | Container name incorrect | Run `docker ps` recipe (#5) to verify |
| `Route resolution exception` | Stale route cache | Use full `drush cr` instead of surgical tag invalidation |

## CloudFront Invalidation (Public URLs Only)

Admin URLs (`admin.ahrq.gov`, `effectivehealthcare-admin.ahrq.gov`) bypass CloudFront. Only public-facing URLs need CDN invalidation:

```bash
ssh -o StrictHostKeyChecking=no dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local \
  "sudo su - ahrqgovjenkins.deploy@ahrq.local -c 'aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION_ID \
  --paths \"/path/*\" \
  --region us-east-1 --output json'"
```

| Distribution ID | Domain |
|----------------|--------|
| `E2WCR860QC4KOD` | `www.ahrq.gov` (Production) |
| `E2T52PX9S8Q6R1` | `ahrq-stage.ahrq.gov` (Staging) |
| `E387AR7CXV2M6T` | `archive.ahrq.gov` (Archive) |

## Redis Notes

- **Location:** AWS ElastiCache (external to Docker containers)
- **Cache Prefix:** Isolated by environment (blue/live separate per AQD-9452)
- **Test:** `sudo docker exec CONTAINER drush cache:get system.site`

## References

- **Tickets:** AQD-9432 (Cache Runbook), AQD-9452 (Redis isolation), AQD-9309 (Route cache)
- **Verified:** 2026-09-02 — All discovery commands and SSM cache clears tested against AHRQ, EHC, and PSO accounts
