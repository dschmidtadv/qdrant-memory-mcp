---
name: aws-ssm-connection
description: Execute commands on AWS EC2 instances via SSM Session Manager. Handles instance discovery, session management, container operations, and command execution. Use for remote SSH-like access, Docker container commands, Drush operations, and instance diagnostics.
triggers:
  - ssm
  - session-manager
  - ec2-command
  - instance
  - docker-exec
  - drush
  - remote-command
---

# AWS SSM Connection Skill

Execute commands on AWS EC2 instances via AWS Systems Manager Session Manager without requiring SSH keys or port 22 access.

## Prerequisites

1. **AWS CLI** installed locally (`aws --version`)
2. **Session Manager Plugin** installed (`which session-manager-plugin`)
3. **Valid AWS credentials** configured (via Kion, SSO, or IAM keys)
4. **Instance ID** of the target EC2 instance
5. **IAM permissions** on the instance (SSM agent running, IAM instance profile with SSM permissions)

## Pre-Flight Check

Before executing any SSM commands:

### Step 0: Credential Selection

**MANDATORY:** Read the active project's `.env` to discover the default profile, then ask the user which credential method to use.

```bash
# Read .env from the current workspace root
cat .env | grep -E "AWS_PROFILE|AWS_REGION"
```

Once you have the `.env` values, present the user with this exact choice **before proceeding**:

> I found `AWS_PROFILE=<VALUE_FROM_ENV>` in your `.env`.
> How would you like to authenticate for this SSM session?
>
> **[1] Use .env profile (default)** — `--profile <VALUE_FROM_ENV>`
> **[2] Use a different named profile** — I'll ask you for the profile name
> **[3] Use explicit access keys** — I'll ask you for `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_SESSION_TOKEN`

**Branch A — .env profile (option 1):**
Use `--profile <VALUE_FROM_ENV>` in all commands. Proceed to Step 1.

**Branch B — different named profile (option 2):**
Ask: "What is the AWS profile name?" Then use `--profile <USER_PROVIDED_PROFILE>`. Proceed to Step 1.

**Branch C — explicit access keys (option 3):**
Ask for `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` (if using STS/MFA).
Prepend all commands with the environment variables instead of `--profile`:
```bash
AWS_ACCESS_KEY_ID=<KEY> AWS_SECRET_ACCESS_KEY=<SECRET> AWS_SESSION_TOKEN=<TOKEN> \
  aws ssm start-session ...
```
Do NOT use `--profile` flag when using explicit keys. Proceed to Step 1.

**If `.env` is missing or does not define `AWS_PROFILE`:** Skip option 1 and offer only options 2 and 3.

### Step 1: Verify AWS credentials

```bash
aws sts get-caller-identity --profile <PROFILE_NAME>
```
Confirm the Account ID and Role match the target instance's account.

### Step 2: Verify instance exists and is running

```bash
aws ec2 describe-instances --instance-ids <INSTANCE_ID> --region <REGION> --profile <PROFILE_NAME> \
  --query "Instances[0].[State.Name,PrivateIpAddress,Tags[?Key=='Name'].Value|[0]]" --output text
```

### Step 3: Test SSM connectivity

```bash
aws ssm describe-instance-information --instance-information-filter-list "key=InstanceIds,valueSet=<INSTANCE_ID>" \
  --region <REGION> --profile <PROFILE_NAME>
```

### Step 4: Fallback - Bastion Host Connection (if SSM not available)

If direct SSM connection is not possible (SSM agent not running, IAM permissions missing, or network restrictions), use a bastion host as an alternative:

```bash
# Connect to bastion host
ssh <USERNAME>@<BASTION_HOSTNAME>

# Example:
ssh dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local
```

Once connected to the bastion, elevate to the deployment user:

```bash
sudo su - <DEPLOY_USER>@<DOMAIN>

# Example:
sudo su - ahrqgovjenkins.deploy@ahrq.local
```

**Common Bastion Configurations:**

| Environment | Bastion Host | Username | Deployment User |
|-------------|--------------|----------|-----------------|
| AHRQ | `ahrq-jenkins-03.ahrq.local` | `dietrich.gottfriedsc@ahrq.local` | `ahrqgovjenkins.deploy@ahrq.local` |

From the deployment user account, you can execute commands on target machines using SSH, SCP, or other connection methods as available in that environment.


## Usage Patterns

### Pattern 1: Run a Simple Command

```bash
aws ssm start-session --target <INSTANCE_ID> \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['<YOUR_COMMAND>']" \
  --region <REGION> \
  --profile <PROFILE_NAME>
```

**Example:** Run `docker ps` on a remote instance
```bash
aws ssm start-session --target i-0a229c8ae49c2734f \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker ps --format \"table {{.Names}}\t{{.Image}}\"']" \
  --region us-east-1 \
  --profile 225577488556_ct-pso-dev-role
```

### Pattern 2: Execute Container Command (Drush, etc.)

```bash
aws ssm start-session --target <INSTANCE_ID> \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker exec <CONTAINER_NAME> <COMMAND>']" \
  --region <REGION> \
  --profile <PROFILE_NAME>
```

**Example:** Run drush config:get on pso-drupal-web container
```bash
aws ssm start-session --target i-0a229c8ae49c2734f \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker exec pso-drupal-web drush config:get <CONFIG_KEY>']" \
  --region us-east-1 \
  --profile 225577488556_ct-pso-dev-role
```

### Pattern 3: List Running Containers

```bash
aws ssm start-session --target <INSTANCE_ID> \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker ps --format \"table {{.Names}}\t{{.Image}}\"']" \
  --region <REGION> \
  --profile <PROFILE_NAME>
```

### Pattern 4: View Logs from Container

```bash
aws ssm start-session --target <INSTANCE_ID> \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker logs <CONTAINER_NAME> --tail 50']" \
  --region <REGION> \
  --profile <PROFILE_NAME>
```

### Pattern 5: Complex Commands with Bash

For commands with pipes, conditionals, or complex logic, wrap in bash:

```bash
aws ssm start-session --target <INSTANCE_ID> \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker exec <CONTAINER> bash -c \"<COMMAND> | grep <FILTER>\"']" \
  --region <REGION> \
  --profile <PROFILE_NAME>
```

## Common Errors & Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `EOF` at end of output | Session closed after command executed | Expected behavior; output is returned before disconnect |
| `InstanceIds not in valid state` | Instance not in running state or IAM user lacks permissions | Check instance state with `ec2 describe-instances`; verify IAM permissions |
| `Cannot perform start session` | Session manager plugin not installed | Install: `brew install session-manager-plugin` (macOS) or equivalent for your OS |
| `permission denied while trying to connect to Docker daemon` | SSM user lacks Docker permissions | Use `sudo docker` instead of just `docker` |
| `No such container` | Container name is incorrect | First run `sudo docker ps` to list actual container names |
| `AccessDeniedException` for SSM | IAM role lacks `ssm:StartSession` permission | Add `ssm:StartSession` and `ssm:TerminateSession` to instance profile policy |

## Output Parsing Tips

SSM output includes session headers and footers. To extract just the command output:

```bash
aws ssm start-session ... 2>&1 | grep -v "Starting session" | grep -v "Cannot perform" | tail -n +2
```

Or pipe through `tail -<N>` to get the last N lines of output (before the `Cannot perform EOF` message).

## Security Notes

- SSM sessions are encrypted in transit
- All commands are logged in CloudTrail (if enabled)
- No SSH keys or firewall rule changes needed
- Instance must have SSM agent running and IAM permissions
- User must have `ssm:StartSession` permission in their IAM policy

## PSO-Specific Configurations

For PSO Drupal staging (account 225577488556):

- **Instance ID:** `i-0a229c8ae49c2734f` (PSO Stage Auto Scaled Servers)
- **Container name:** `pso-drupal-web` (not `pso-drupal`)
- **Region:** `us-east-1`
- **Profile:** `225577488556_ct-pso-dev-role` (Kion credentials)

### Common PSO Commands

**Check XML URL config:**
```bash
aws ssm start-session --target i-0a229c8ae49c2734f \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker exec pso-drupal-web drush config:get <CONFIG_KEY>']" \
  --region us-east-1 --profile 225577488556_ct-pso-dev-role
```

**List all running containers:**
```bash
aws ssm start-session --target i-0a229c8ae49c2734f \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker ps --format \"table {{.Names}}\t{{.Image}}\"']" \
  --region us-east-1 --profile 225577488556_ct-pso-dev-role
```

**Check Drupal status:**
```bash
aws ssm start-session --target i-0a229c8ae49c2734f \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker exec pso-drupal-web drush status']" \
  --region us-east-1 --profile 225577488556_ct-pso-dev-role
```

## PSO Drush Command Reference

All Drush commands on PSO use this wrapper:
```bash
aws ssm start-session --target i-0a229c8ae49c2734f \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker exec pso-drupal-web drush <DRUSH_COMMAND>']" \
  --region us-east-1 --profile 225577488556_ct-pso-dev-role
```

Replace `<DRUSH_COMMAND>` with any of the following:

| Task | Drush Command |
|------|--------------|
| Cache rebuild | `cr` |
| Import config | `cim -y` |
| Export config | `cex -y` |
| Run DB updates | `updb -y` |
| One-time login link | `uli` |
| Drupal status | `status` |
| List modules | `pm:list --status=enabled` |
| Enable module | `en <module_name> -y` |
| Disable module | `pmu <module_name> -y` |
| View recent logs | `watchdog:show --count=50` |
| Get a config value | `config:get <config_key>` |
| Set a config value | `config:set <config_key> <value> -y` |
| SQL dump | `sql-dump > /tmp/backup.sql` |
| SQL query | `sql-query "SELECT * FROM node LIMIT 5"` |
| User login by UID | `user:login --uid=1` |
| List users | `sql-query "SELECT uid,name,mail FROM users_field_data LIMIT 20"` |
| Queue worker run | `queue:run <queue_name>` |
| Cron run | `cron` |

**Full example — cache rebuild:**
```bash
aws ssm start-session --target i-0a229c8ae49c2734f \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker exec pso-drupal-web drush cr']" \
  --region us-east-1 --profile 225577488556_ct-pso-dev-role
```

**Full example — config import:**
```bash
aws ssm start-session --target i-0a229c8ae49c2734f \
  --document-name AWS-StartInteractiveCommand \
  --parameters "command=['sudo docker exec pso-drupal-web drush cim -y']" \
  --region us-east-1 --profile 225577488556_ct-pso-dev-role
```
