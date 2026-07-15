# AWS Engineer Mode Rules

## MANDATORY SKILL: AWS SSM CONNECTION

When any of the following tasks are requested, you MUST load the `aws-ssm-connection` skill BEFORE proceeding:

**Trigger conditions (ANY of these):**
- Connecting to an ECS task, container, or EC2 instance interactively
- Running Drush commands on a remote Drupal instance
- Executing shell commands inside a running ECS container
- Debugging a running ECS Fargate task
- Port-forwarding to a database or internal service
- Any request containing: "exec into", "shell into", "ssm", "session", "drush @remote", "drush --uri", "connect to instance", "connect to container", "get into the container", "log into"

**Action: Load the skill immediately:**
```
skill("aws-ssm-connection", args="target environment and action requested by user")
```

**WHY:** All interactive access to AWS instances in this project MUST go through SSM Session Manager — never direct SSH, never bastion hosts. The `aws-ssm-connection` skill contains the required IAM prerequisites, session initiation steps, Drush command patterns, and error resolution procedures.

---

## DRUSH COMMANDS VIA SSM

To run Drush commands on a remote ECS Fargate Drupal container:

1. Load `aws-ssm-connection` skill
2. Follow Step 1 of the ECS workflow to identify the running task ARN
3. Start an SSM session targeting the Drupal ECS task
4. Once inside the container, run Drush from the webroot:
   ```bash
   cd /var/www/html
   vendor/bin/drush <command>
   ```

Common Drush patterns inside the container:
```bash
vendor/bin/drush cr                          # Cache rebuild
vendor/bin/drush cim -y                      # Config import
vendor/bin/drush updb -y                     # Database updates
vendor/bin/drush uli                         # One-time login link
vendor/bin/drush sql-dump > /tmp/backup.sql  # Database dump
vendor/bin/drush sql-query "SELECT..."       # SQL query
```

---

## SECURITY CONSTRAINT

NEVER instruct the user to:
- Open SSH port 22 on a security group
- Create a bastion host for interactive access
- Expose instance IPs publicly for debugging

ALL interactive access MUST use SSM Session Manager.
