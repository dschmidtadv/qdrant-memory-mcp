---
name: aws-ssm-connection
description: Execute commands on AWS EC2 instances via SSM Session Manager. Handles instance discovery, session management, container operations, and command execution. Use for remote SSH-like access, Docker container commands, Drush operations, and instance diagnostics.
---

# AWS SSM Connection Skill

Execute commands on AWS EC2 instances via AWS Systems Manager. Uses **direct SSM** (`ssm:SendCommand` or `ssm:StartSession`) as the primary method; falls back to **bastion host / Jenkins proxy** only when direct SSM is unavailable.

## Connection Strategy

```
┌─────────────────────────────────────────┐
│  1. DIRECT SSM (Primary)                │
│     ssm:SendCommand / StartSession      │
│     ↓ fails?                            │
│  2. BASTION HOST (Fallback)             │
│     SSH → bastion → SSM from bastion    │
│     ↓ fails?                            │
│  3. JENKINS PROXY (Last Resort)         │
│     Trigger Jenkins job with SSM step   │
└─────────────────────────────────────────┘
```

## Prerequisites

1. **AWS CLI v2** installed (`aws --version`)
2. **Session Manager Plugin** installed (`which session-manager-plugin`)
3. **Valid AWS credentials** configured (Kion/SSO temporary credentials in `~/.aws/credentials`)

## Environment Registry

### Production Instances (as of 2026-09-04)

| Project | Account | Profile | Instance ID | Name | IP |
|---------|---------|---------|-------------|------|-----|
| **AHRQGOV** | 406380712964 | `406380712964_ct-ahrqgov-dev-role` | `i-01b8189e854b8931a` | AHRQ Jenkins 3 | 10.61.0.210 |
| **AHRQGOV** | 406380712964 | `406380712964_ct-ahrqgov-dev-role` | `i-0be8692a6043b7e8e` | AHRQGOV Production Auto Scaled Servers | 10.61.1.216 |
| **AHRQGOV** | 406380712964 | `406380712964_ct-ahrqgov-dev-role` | `i-032a93fb658548844` | AHRQGOV Production Auto Scaled Servers | 10.61.12.101 |
| **EHC** | 975242026693 | `975242026693_ct-ehc-dev-role` | `i-0fe93a37aa4a5551b` | EHC Production Auto Scaled Servers | 10.58.4.102 |
| **EHC** | 975242026693 | `975242026693_ct-ehc-dev-role` | `i-0ad7ccb3f024401a9` | EHC Production Auto Scaled Servers | 10.58.9.146 |
| **PSO** | 225577488556 | `225577488556_ct-pso-dev-role` | `i-07d80f94de705fd88` | PSO Production Auto Scaled Instances | 10.59.1.6 |
| **PSO** | 225577488556 | `225577488556_ct-pso-dev-role` | `i-026f2640c70a49e5d` | PSO Production Auto Scaled Instances | 10.59.3.245 |

### Staging Instances

> **Note:** EHC and PSO staging ASGs are normally scaled to **0** when idle. You must wake them up before SSM will return any instances. See **EHC Staging Wake-Up** section below.

| Project | Account | Profile | Instance ID | Name |
|---------|---------|---------|-------------|------|
| **EHC** | 975242026693 | `975242026693_ct-ehc-dev-role` | *(dynamic — discover after wake-up)* | EHC Stage Auto Scaled Servers |
| **PSO** | 225577488556 | `225577488556_ct-pso-dev-role` | `i-0a229c8ae49c2734f` | PSO Stage Auto Scaled Servers |

### EHC Staging Wake-Up (ASG scaled to zero)

EHC staging (`EHC-Stage-ASG`) idles at desired=0. Before running any SSM commands on staging, invoke the wake-up Lambda:

**Step 1 — Scale up via Lambda (required payload: `asg` key)**
```bash
aws lambda invoke \
  --profile 975242026693_ct-ehc-dev-role \
  --region us-east-1 \
  --function-name stage-wakeup-handler \
  --payload '{"asg": "EHC-Stage-ASG"}' \
  --cli-binary-format raw-in-base64-out \
  /tmp/ehc-wakeup.json && cat /tmp/ehc-wakeup.json
```
Expected: `{"status": "ok", "action": "scaled_up", "message": "...ready in ~9 minutes."}`

> ⚠️ Calling with `{}` (empty payload) returns HTTP 400 `asg parameter required` — always pass the `asg` key.

**Step 2 — Get the new instance ID from ASG**
```bash
aws autoscaling describe-auto-scaling-groups \
  --profile 975242026693_ct-ehc-dev-role \
  --region us-east-1 \
  --auto-scaling-group-names EHC-Stage-ASG \
  --query 'AutoScalingGroups[0].Instances[*].[InstanceId,LifecycleState,HealthStatus]' \
  --output table
```

**Step 3 — Poll SSM until Online (~9 min)**
```bash
aws ssm describe-instance-information \
  --profile 975242026693_ct-ehc-dev-role \
  --region us-east-1 \
  --filters "Key=InstanceIds,Values=<INSTANCE_ID>" \
  --query 'InstanceInformationList[*].[InstanceId,PingStatus,IPAddress]' \
  --output table
```
Poll every 60 seconds. Proceed when `PingStatus = Online`.

### EHC ASG Inventory

| ASG Name | Normal Desired | Purpose |
|----------|---------------|---------|
| `EHC-Prod-ASG` | 2 | Production live/green |
| `EHC-Prod-Blue-ASG` | 0 | Production blue (deploy slot) |
| `EHC-Stage-ASG` | 0 (idle) | **Staging live** — wake with Lambda |
| `EHC-Stage-Blue-ASG` | 0 | Staging blue (deploy slot) |

### Container Names by Project

| Project | Container Name | Used For |
|---------|---------------|----------|
| AHRQGOV | `ahrqgov-drupal-web` | Drupal web server |
| EHC | `ehc-drupal-web` | Drupal web server |
| PSO | `pso-drupal-web` | Drupal web server |
> **Note:** Instance IDs for Auto Scaled instances change on scale events. Always run `ssm describe-instance-information` to discover current instances before targeting.

> **CRITICAL — Nessus/Security scanning:** Nessus findings on EHC/AHRQ instances are **host-OS level (Ubuntu 22.04)**, NOT container level (the Docker image is Debian 11/bullseye). Always verify vulnerable packages on the **EC2 host directly** via SSM, not inside `docker exec`. Use `apt list --installed` on the host, and `curl -s http://169.254.169.254/latest/meta-data/ami-id` to confirm AMI. See EHCD-3388 for the verification pattern.


---

## Pre-Flight Check

### Step 0: Credential Selection

**MANDATORY:** Read the active project's `.env` to discover the default profile, then ask the user which credential method to use.

```bash
cat .env | grep -E "AWS_PROFILE|AWS_REGION"
```

Present the user with:

> I found `AWS_PROFILE=<VALUE>` in your `.env`.
> How would you like to authenticate?
>
> **[1] Use .env profile (default)** — `--profile <VALUE>`
> **[2] Use a different named profile** — I'll ask for the name
> **[3] Use explicit access keys** — I'll ask for Key/Secret/Token

### Step 1: Verify credentials

```bash
aws sts get-caller-identity --profile <PROFILE> --region us-east-1
```

### Step 2: Verify SSM connectivity (determines direct vs fallback)

```bash
aws ssm describe-instance-information \
  --profile <PROFILE> --region us-east-1 \
  --query 'InstanceInformationList[*].[InstanceId,ComputerName,PingStatus]' \
  --output table
```

**If this succeeds** → Use **Direct SSM** (Method 1)
**If this fails with ExpiredTokenException** → Refresh credentials, retry
**If this fails with AccessDeniedException** → Use **Bastion Fallback** (Method 2)

### Step 3: Test SendCommand permission

```bash
aws ssm send-command \
  --profile <PROFILE> --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids "<INSTANCE_ID>" \
  --parameters 'commands=["echo SSM-connectivity-OK"]' \
  --query 'Command.CommandId' --output text
```

**If this succeeds** → Use **SendCommand** for non-interactive operations (preferred for automation)
**If this fails with AccessDeniedException** → Use **StartSession** instead, or fall back to bastion

---

## Method 1: Direct SSM (PRIMARY)

### Pattern A: SendCommand (Non-Interactive — Preferred for Automation)

Best for: scripted commands, Drush operations, Docker exec, CI/CD.
Returns structured output. No interactive terminal needed.

```bash
# Send command
CMD_ID=$(aws ssm send-command \
  --profile <PROFILE> --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids "<INSTANCE_ID>" \
  --parameters 'commands=["<YOUR_COMMAND>"]' \
  --comment "<DESCRIPTION>" \
  --query 'Command.CommandId' --output text)

# Wait for completion (poll every 2 seconds)
sleep 5

# Retrieve output
aws ssm get-command-invocation \
  --profile <PROFILE> --region us-east-1 \
  --command-id "$CMD_ID" \
  --instance-id "<INSTANCE_ID>" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
```

**Examples:**

```bash
# Docker ps
aws ssm send-command --profile 406380712964_ct-ahrqgov-dev-role --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids "i-0be8692a6043b7e8e" \
  --parameters 'commands=["sudo docker ps --format \"table {{.Names}}\t{{.Image}}\t{{.Status}}\""]' \
  --query 'Command.CommandId' --output text

# Drush cache rebuild
aws ssm send-command --profile 225577488556_ct-pso-dev-role --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids "i-07d80f94de705fd88" \
  --parameters 'commands=["sudo docker exec pso-drupal-web drush cr"]' \
  --query 'Command.CommandId' --output text

# Drush status
aws ssm send-command --profile 975242026693_ct-ehc-dev-role --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids "i-0fe93a37aa4a5551b" \
  --parameters 'commands=["sudo docker exec ehc-drupal-web drush status"]' \
  --query 'Command.CommandId' --output text
```

### Pattern B: StartSession with Interactive Command (Semi-Interactive)

Best for: single commands that need a pseudo-terminal, quick checks.

```bash
aws ssm start-session --target <INSTANCE_ID> \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['<YOUR_COMMAND>']" \
  --region us-east-1 \
  --profile <PROFILE>
```

**Examples:**

```bash
# List containers on PSO production
aws ssm start-session --target i-07d80f94de705fd88 \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker ps --format \"table {{.Names}}\t{{.Image}}\"']" \
  --region us-east-1 --profile 225577488556_ct-pso-dev-role

# Drush config:get on AHRQGOV
aws ssm start-session --target i-0be8692a6043b7e8e \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker exec ahrqgov-drupal-web drush config:get system.site name']" \
  --region us-east-1 --profile 406380712964_ct-ahrqgov-dev-role
```

### Pattern C: StartSession (Fully Interactive Shell)

Best for: debugging, file browsing, real-time troubleshooting.

```bash
aws ssm start-session --target <INSTANCE_ID> \
  --region us-east-1 \
  --profile <PROFILE>
```

> **Note:** Interactive sessions are not suitable for agent automation. Use SendCommand for scripted operations.

---

## Method 2: Bastion Host Fallback

Use when direct SSM is unavailable (SSM agent down, IAM permissions missing, or network restrictions).

### Step 1: SSH to bastion

```bash
ssh dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local
```

### Step 2: Elevate to deployment user

```bash
sudo su - ahrqgovjenkins.deploy@ahrq.local
```

### Step 3: Use SSM from bastion with explicit credentials

The bastion host does NOT use AWS CLI config profiles; use environment variables:

```bash
AWS_ACCESS_KEY_ID=<KEY> AWS_SECRET_ACCESS_KEY=<SECRET> AWS_SESSION_TOKEN=<TOKEN> \
  aws ssm start-session --target <INSTANCE_ID> \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['<YOUR_COMMAND>']" \
  --region us-east-1
```

### Bastion Configuration

| Environment | Bastion Host | Username | Deployment User |
|-------------|-------------|----------|-----------------|
| AHRQ | `ahrq-jenkins-03.ahrq.local` | `dietrich.gottfriedsc@ahrq.local` | `ahrqgovjenkins.deploy@ahrq.local` |

---

## Method 3: Jenkins Proxy (Last Resort)

Use when both direct SSM and bastion are unavailable.

Trigger a Jenkins job that executes SSM commands as part of a pipeline step. This is the original method used before direct SSM permissions were granted.

> **Note:** This method is deprecated in favor of direct SSM. Use only as last resort.

---

## Drush Command Reference

All Drush commands use SendCommand with this pattern:

```bash
CMD_ID=$(aws ssm send-command \
  --profile <PROFILE> --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids "<INSTANCE_ID>" \
  --parameters 'commands=["sudo docker exec <CONTAINER> drush <DRUSH_CMD>"]' \
  --query 'Command.CommandId' --output text)

sleep 5

aws ssm get-command-invocation \
  --profile <PROFILE> --region us-east-1 \
  --command-id "$CMD_ID" --instance-id "<INSTANCE_ID>" \
  --query '[Status,StandardOutputContent]' --output text
```

| Task | Drush Command |
|------|--------------|
| Cache rebuild | `cr` |
| Import config | `cim -y` |
| Export config | `cex -y` |
| Run DB updates | `updb -y` |
| One-time login | `uli` |
| Drupal status | `status` |
| List enabled modules | `pm:list --status=enabled` |
| Enable module | `en <module> -y` |
| Disable module | `pmu <module> -y` |
| View recent logs | `watchdog:show --count=50` |
| Get config value | `config:get <key>` |
| Set config value | `config:set <key> <value> -y` |
| SQL dump | `sql-dump > /tmp/backup.sql` |
| SQL query | `sql-query "SELECT * FROM node LIMIT 5"` |
| User login by UID | `user:login --uid=1` |
| List users | `sql-query "SELECT uid,name,mail FROM users_field_data LIMIT 20"` |
| Queue worker | `queue:run <queue_name>` |
| Cron run | `cron` |

---

## Instance Discovery (Dynamic)

Auto Scaled instances change IDs. Always discover current instances first:

```bash
# List all managed instances for a project
aws ssm describe-instance-information \
  --profile <PROFILE> --region us-east-1 \
  --query 'InstanceInformationList[*].[InstanceId,ComputerName,PingStatus,IPAddress]' \
  --output table

# Get Name tags for discovered instances
aws ec2 describe-instances \
  --profile <PROFILE> --region us-east-1 \
  --instance-ids <ID1> <ID2> \
  --query 'Reservations[*].Instances[*].[InstanceId,Tags[?Key==`Name`].Value|[0],State.Name]' \
  --output table
```

---

## Common Errors & Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `ExpiredTokenException` | STS credentials expired | Refresh via Kion SSO portal, paste new creds in `~/.aws/credentials` |
| `AccessDeniedException` on `SendCommand` + `document/AWS-RunShellScript` | Role missing SSM document resource | Add `arn:aws:ssm:us-east-1::document/AWS-RunShellScript` to IAM policy |
| `AccessDeniedException` on `SendCommand` + `instance/` | Role missing EC2 instance resource | Add `arn:aws:ec2:us-east-1:ACCOUNT:instance/*` to IAM policy |
| `EOF` at end of StartSession output | Session closed after command executed | Expected behavior — output is returned before disconnect |
| `InstanceIds not in valid state` | Instance not running or SSM agent down | Check instance state: `ec2 describe-instances` |
| `Cannot perform start session` | Session Manager plugin not installed | Install: `brew install session-manager-plugin` |
| `permission denied ... Docker daemon` | SSM user lacks Docker access | Use `sudo docker` instead of `docker` |
| `No such container` | Wrong container name | Run `sudo docker ps` first to get actual names |
| `InvocationDoesNotExist` | Command still in progress or wrong CommandId | Wait longer, then retry `get-command-invocation` |

## Output Parsing Tips

**SendCommand output** (preferred — clean JSON):
```bash
aws ssm get-command-invocation ... --query 'StandardOutputContent' --output text
```

**StartSession output** (has session headers/footers):
```bash
aws ssm start-session ... 2>&1 | grep -v "Starting session" | grep -v "Cannot perform" | tail -n +2
```

## Security Notes

- SSM sessions are encrypted in transit
- All commands are logged in CloudTrail
- No SSH keys or firewall rules needed for direct SSM
- Instance must have SSM agent running and IAM instance profile
- User must have SSM permissions (all 7 verified as of 2026-09-04)
- `SendCommand` is preferred over `StartSession` for automation — it produces auditable, retrievable output
