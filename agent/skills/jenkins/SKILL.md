---
name: jenkins
description: Jenkins job configuration management, API authentication, and multi-project deployment patterns
---

# Jenkins Job Configuration & Deployment Management

## Overview

This skill documents practical patterns for managing Jenkins jobs across multi-project environments
(AHRQ, EHC, PSO), including job config exports/imports, API-driven updates, SCM branch management,
secure credential storage, and known failure patterns.

**Jenkins Instance:** `http://ahrq-jenkins-03.ahrq.local:8080`
**Default User:** `dietric`
**Config Repo:** `jenkins-configs/` in `web-services-devops` (GitHub)
**Tooling:** `jenkins-config-sync/` directory — export, import, auto-sync scripts

---

## 1. Authentication & Secure Token Storage

### Generate API Token

1. Jenkins UI → **My Account (top right) → Configure → API Token → Add new Token**
2. Copy the token immediately — it is only shown once
3. Store securely (see options below)

### Token Storage Options

**Option 1: macOS Keychain (Recommended for local development)**

```bash
# Store (one-time setup)
security add-generic-password -a jenkins -s "jenkins-api-token" -w "<your_token>"

# Retrieve in scripts — never exposed in shell history
export JENKINS_API_TOKEN=$(security find-generic-password -a jenkins -s "jenkins-api-token" -w)

# Verify
echo "Token loaded: ${JENKINS_API_TOKEN:0:10}..."
```

Advantages: encrypted at rest, auto-unlocked when logged in, no plaintext files.

**Option 2: `.env` file in `jenkins-config-sync/` (Recommended canonical approach)**

All three connection variables live in one place. The `jenkins-config-sync/` scripts load
this file automatically, and you can source it manually in any shell session:

```bash
# One-time setup: copy the example and fill in your values
cp jenkins-config-sync/.env.example jenkins-config-sync/.env

# jenkins-config-sync/.env contents:
# JENKINS_API_TOKEN=<token from Keychain or generated directly>
# JENKINS_URL=http://ahrq-jenkins-03.ahrq.local:8080
# JENKINS_USER=dietric
```

Source before running any manual curl commands:

```bash
# Load all Jenkins connection variables from .env
set -a && source jenkins-config-sync/.env && set +a

# Verify
echo "User: $JENKINS_USER  URL: $JENKINS_URL  Token: ${JENKINS_API_TOKEN:0:8}..."
```

The `.env` file is `.gitignore`-listed — it must NEVER be committed to version control.

**Option 3: Shell profile (Persistent across sessions)**

```bash
echo 'export JENKINS_API_TOKEN="your_token"' >> ~/.zshrc
source ~/.zshrc
```

**Option 4: AWS Secrets Manager (Production / CI-CD)**

```bash
# Store
aws secretsmanager create-secret \
  --name jenkins/api-token \
  --secret-string '{"token":"<token>","user":"dietric"}' \
  --profile 406380712964_ct-ahrqgov-dev-role

# Retrieve in pipelines
JENKINS_API_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id jenkins/api-token \
  --query SecretString --output text | jq -r '.token')
```

**Option 5: GitHub Actions Secrets**

```yaml
- name: Push Jenkins config
  env:
    JENKINS_API_TOKEN: ${{ secrets.JENKINS_API_TOKEN }}
    JENKINS_USER: ${{ secrets.JENKINS_USER }}
    JENKINS_URL: ${{ secrets.JENKINS_URL }}
  run: |
    curl -s -X POST -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
      -H "Content-Type: application/xml" \
      --data-binary @jenkins-configs/jobs/EHC/ehc-drupal-site-deploy-stage/config.xml \
      "$JENKINS_URL/job/EHC/job/ehc-drupal-site-deploy-stage/config.xml"
```

### Security Rules

| ✅ DO | ❌ NEVER |
|-------|---------|
| Store in Keychain or Secrets Manager | Commit token to Git |
| Use `$JENKINS_API_TOKEN` env var in scripts | Pass token as CLI argument |
| Rotate every 90 days | Log token in build output |
| Revoke old tokens after rotation | Share via email or Slack |

### Token Rotation Checklist

- [ ] Generate new token in Jenkins UI
- [ ] Update Keychain: `security add-generic-password -a jenkins -s "jenkins-api-token" -w "<new>" -U`
- [ ] Update AWS Secrets Manager (if used)
- [ ] Update CI/CD secrets
- [ ] Test new token with a read-only API call
- [ ] Revoke old token in Jenkins UI
- [ ] Document rotation date

---

## 2. Job Config Export (Pulling from Jenkins)

### Export All Jobs

```bash
# Export all configurations from Jenkins to local files
cd /path/to/web-services-devops
export JENKINS_API_TOKEN=$(security find-generic-password -a jenkins -s "jenkins-api-token" -w)
./jenkins-config-sync/export-jenkins-jobs.sh
```

Output structure in `jenkins-configs/`:
```
jobs/
  AHRQGOV/
    ahrqgov-drupal-site-deploy-stage/config.xml
    ahrqgov-drupal-site-deploy-production-blue/config.xml
    ahrqgov-drupal-site-deploy-production-live/config.xml
  EHC/
    ehc-drupal-site-deploy-stage/config.xml
    ehc-drupal-site-deploy-production-blue/config.xml
  PSO-Drupal/
    pso-drupal-site-deploy-stage/config.xml
    pso-drupal-site-deploy-production-blue/config.xml
system/
  jenkins-info.json
  plugins.json
```

### Auto-Sync (Export + Git Commit)

```bash
./jenkins-config-sync/auto-sync.sh
# Exports all configs, commits to Git, pushes to remote
# Runs on cron schedule if setup via: ./jenkins-config-sync/setup-cron.sh
```

### Known Export Issues

**Issue: URL encoding failure — spaces AND square brackets in query strings**

Curl exits with code 3 ("bad/illegal URL format") for two reasons:
1. Job names with spaces (e.g., `AHRQ Production Cron`)
2. The `?tree=jobs[name,url]` query string — square brackets break URL parsing

**Always URL-encode brackets when using `?tree=` queries:**

```bash
# WRONG — curl exit code 3:
curl "$JENKINS_URL/job/EHC/api/json?tree=jobs[name,url]"

# CORRECT — URL-encode [ as %5B and ] as %5D, comma as %2C:
curl "$JENKINS_URL/job/EHC/api/json?tree=jobs%5Bname%2Curl%5D"
```

The export script applies the same fix for job name spaces:

```bash
local encoded_endpoint=$(echo "$endpoint" | sed 's/ /%20/g; s/\[/%5B/g; s/\]/%5D/g')
```

If the export script fails for jobs with spaces or bracket query strings, ensure you are
using the latest `export-jenkins-jobs.sh` which includes this fix.

**Issue: Folders misclassified as jobs**

The API returns folders and jobs in the same list. The script must check the `_class`
field to distinguish `com.cloudbees.hudson.plugins.folder.Folder` (skip) from job types.

---

## 3. Job Config Import (Pushing to Jenkins)

### ⚠️ Critical: Folder-based Jobs Require Nested API Paths

The `import-jenkins-jobs.sh` script uses flat paths (`/job/<name>/config.xml`) which
**fails silently for folder-based jobs**. All three project job families (AHRQGOV, EHC,
PSO-Drupal) are nested in folders.

This is a known, unfixed limitation of the script — not something to re-diagnose.
Don't try to patch `import-jenkins-jobs.sh` for folder support; use the manual curl
workflow below instead. If someone does fix the script, update this section and drop
the workaround.

**Correct path format:**
```
/job/<folder>/job/<jobname>/config.xml
```

### Push Individual Job (Recommended Approach)

```bash
# Load connection variables from .env (preferred over hardcoding)
set -a && source jenkins-config-sync/.env && set +a

# Fallback: load token from Keychain if not in .env
export JENKINS_API_TOKEN=${JENKINS_API_TOKEN:-$(security find-generic-password -a jenkins -s "jenkins-api-token" -w)}

# Example: EHC stage job
curl -s -X POST \
  -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @jenkins-configs/jobs/EHC/ehc-drupal-site-deploy-stage/config.xml \
  "$JENKINS_URL/job/EHC/job/ehc-drupal-site-deploy-stage/config.xml" \
  -w "\nHTTP Status: %{http_code}\n"
```

**Response Codes:**
- `200 OK` — Config successfully updated ✅
- `401 Unauthorized` — Invalid or missing token → check `$JENKINS_API_TOKEN`
- `404 Not Found` — Job path wrong or job doesn't exist → verify folder/job names in Jenkins UI

### Push All 4 Core Deployment Jobs (Reference Commands)

```bash
# AHRQ production-blue
curl -s -X POST -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @jenkins-configs/jobs/AHRQGOV/ahrqgov-drupal-site-deploy-production-blue/config.xml \
  "$JENKINS_URL/job/AHRQGOV/job/ahrqgov-drupal-site-deploy-production-blue/config.xml"

# AHRQ production-live
curl -s -X POST -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @jenkins-configs/jobs/AHRQGOV/ahrqgov-drupal-site-deploy-production-live/config.xml \
  "$JENKINS_URL/job/AHRQGOV/job/ahrqgov-drupal-site-deploy-production-live/config.xml"

# EHC stage
curl -s -X POST -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @jenkins-configs/jobs/EHC/ehc-drupal-site-deploy-stage/config.xml \
  "$JENKINS_URL/job/EHC/job/ehc-drupal-site-deploy-stage/config.xml"

# PSO stage
curl -s -X POST -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @jenkins-configs/jobs/PSO-Drupal/pso-drupal-site-deploy-stage/config.xml \
  "$JENKINS_URL/job/PSO-Drupal/job/pso-drupal-site-deploy-stage/config.xml"
```

---

## 4. SCM Branch Configuration in Job config.xml

### Multi-SCM Pattern (Application + Devops repos)

Every deployment job checks out two repos:
1. **Application repo** (GitHub) — the Drupal application source
2. **Devops repo** — deployment scripts (`web-services-devops`)

```xml
<scm class="org.jenkinsci.plugins.multiplescms.MultiSCM" plugin="multiple-scms@0.8">
  <scms>
    <!-- App repo -->
    <hudson.plugins.git.GitSCM plugin="git@5.10.1">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>https://github.com/AHRQ/ehc-drupal/</url>
          <credentialsId>acheslowgithubtoken</credentialsId>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/stage</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <extensions/>
    </hudson.plugins.git.GitSCM>

    <!-- Devops repo -->
    <hudson.plugins.git.GitSCM plugin="git@5.10.1">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>https://github.com/AHRQ/web-services-devops.git</url>
          <credentialsId>acheslowgithubtoken</credentialsId>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/main</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <extensions>
        <hudson.plugins.git.extensions.impl.RelativeTargetDirectory>
          <relativeTargetDir>devops</relativeTargetDir>
        </hudson.plugins.git.extensions.impl.RelativeTargetDirectory>
      </extensions>
    </hudson.plugins.git.GitSCM>
  </scms>
</scm>
```

**Key rules:**
- `RelativeTargetDirectory` ensures devops lands in `devops/` subfolder
- GitHub: credentials `acheslowgithubtoken`, branch format `*/branch-name`
- Internal Gitea: credentials `ubuntu_ssh`, branch format `feature/name` (no `*/` prefix)
- **Avoid internal Gitea** for deploy jobs — use GitHub for portability and visibility.
  Migration off Gitea is in progress, not complete: as of Aug 2026, 18 job configs
  still reference `ahrq-repo-int.ahrq.local`. Check a job's current SCM block before
  assuming it has already moved to GitHub.

### Branch Audit (ADO-320 State — Aug 2026)

`grep -A 1 "BranchSpec" | grep "<name>"` is unreliable for this: it also matches
unrelated `<name>` tags (e.g. `GIT_TAG_NAME` build parameters), and it prints branch
names with no indication of which repo/job they belong to, so the output can't be
paired back into a per-job table. Use this instead — it pairs each `<url>` with its
matching `<name>` per job:

```bash
for f in jenkins-configs/jobs/*/*/config.xml; do
  python3 -c "
import sys, re
x = open(sys.argv[1]).read()
urls = re.findall(r'<url>(.*?)</url>', x)
branches = re.findall(r'<hudson.plugins.git.BranchSpec>\s*<name>(.*?)</name>', x)
job = sys.argv[1].split('/')[-2]
for url, branch in zip(urls, branches):
    print(f'{job:<45} {branch:<45} {url}')
" "$f"
done
```

Current state after ADO-320 (verified against `apps/devops`, Aug 2026):

| Project | Job | devops branch | Notes |
|---------|-----|---------------|-------|
| AHRQ | site-deploy-stage | `ADO-320-site-restore-automation-gaps` | Update to `main` after merge |
| AHRQ | site-deploy-production-blue | `ADO-318-fresh` | Update to `main` after merge |
| AHRQ | site-deploy-production-live | `ADO-318-fresh` | Update to `main` after merge |
| EHC | site-deploy-stage | `ADO-318-fresh` (GitHub) | Updated from Gitea `ADO-241` |
| PSO | site-deploy-stage | `ADO-318-fresh` | Update to `main` after merge (feature branch, not `main`) |
| PSO | site-deploy-production-blue | `main` | ✅ OK |

**Target state (post-ADO-320 merge):** All jobs → `main`

This table is a point-in-time snapshot and will drift as branches merge. Re-run the
audit command above for current truth rather than trusting this table indefinitely.

---

## 5. Deployment Pipeline Architecture

### Blue-Green Deployment Flow

```
Jenkins job triggered (manual or webhook)
  → Checkout app repo + devops repo
  → Export env vars (AWS_PROFILE, PROJECT_NAME, PROJECT_ENVIRONMENT)
  → verify-release.sh — determines PROJECT_VERSION from running ASG
  → 1_blue_predeploy.sh — Gate 0 database pre-creation (async: 3600s)
  → 2_blue_deploy.sh — Docker container start + socket chmod
  → 3_blue_site_restore.sh — Site restore (reads ASG from settings.yml, retry backoff)
  → 4_live_prepromote.sh — Pre-promotion checks
  → 5_live_promote.sh — Traffic cutover (swap Live/Blue ASG capacities)
```

### Scale-to-Zero Environments (EHC Stage, PSO Stage)

Both EHC-Stage-ASG and PSO-Stage-ASG run at Desired=0 when idle (scale-to-zero pattern).
Deployment wakes them:

| Phase | Action | Duration |
|-------|--------|---------|
| Wakeup | ASG scale Desired 0→1 | ~30 seconds |
| Instance launch | EC2 boot + health checks | ~2-3 minutes |
| Deployment | All 5 scripts | ~15-40 minutes |
| Site restore | Most variable phase | 5-20 minutes (60-min timeout) |

### AWS Profile Mapping

| Project | AWS Profile | Account |
|---------|------------|---------|
| AHRQ | `406380712964_ct-ahrqgov-dev-role` | AHRQ production |
| EHC | `975242026693_ct-ehc-dev-role` | EHC |
| PSO | `225577488556_ct-pso-dev-role` | PSO |

Note: Jenkins jobs use named profiles (`EHCDeploy`, `AHRQDeploy`, `PSODeploy`) which
are defined on the Jenkins agent's `~/.aws/config`. These are aliases to the above accounts.

---

## 6. Common Failure Patterns & Fixes

### Pattern 1: Launch Config Name Collision (`_00`, `_01`, `_02`, `_03` suffixes)

**Symptoms:** ASG update fails; 4+ LCs exist for same version
**Root cause:** Previous failed deployments left stale LCs; new attempts append suffixes
**Fix:**

```bash
# List stale LCs for a version
aws autoscaling describe-launch-configurations \
  --profile 406380712964_ct-ahrqgov-dev-role --region us-east-1 \
  --query 'LaunchConfigurations[?contains(LaunchConfigurationName, `ahrq_stage_blue_202608`)].LaunchConfigurationName'

# Delete stale ones (preserve only the latest suffix)
aws autoscaling delete-launch-configuration \
  --launch-configuration-name ahrq_stage_blue_202608_01_12_00 \
  --profile 406380712964_ct-ahrqgov-dev-role --region us-east-1
```

### Pattern 2: ASG Name Derivation Bug

**Symptoms:** Site restore fails with "instance not found" after 60s timeout
**Root cause:** Script derived `AHRQGOV-Stage-Blue-ASG` but actual ASG is `AHRQ-Stage-Blue-ASG`
**Fix:** Read `blue_autoscaling_group_name` directly from `drupal-deploy/<project>/settings.yml`
**Location:** [`drupal-deploy/3_blue_site_restore.sh`](drupal-deploy/3_blue_site_restore.sh)

### Pattern 3: EFS Recursive Chown Timeout

**Symptoms:** Ansible task hangs, slow builds on large EFS-mounted directories
**Root cause:** Recursive `chown` over NFS traverses every file and is extremely slow;
unconditional chowning on every deploy makes this worse even when ownership is already correct
**Fix (as actually shipped under ADO-320):** Check ownership per top-level directory before
chowning, using numeric UID:GID (`33:33` = `www-data` in the container) rather than by name,
and only touch `files` and `files_private`, not the whole version tree:

```yaml
- name: Create Versioned Directory Structure with correct ownership (ADO-320)
  run_once: true
  become: true
  become_method: sudo
  shell: |
    cd /mnt/efs/root
    mkdir -p "{{ version }}/files"
    mkdir -p "{{ version }}/files_private"

    for dir in "{{ version }}/files" "{{ version }}/files_private"; do
      current_owner=$(stat -c '%u:%g' "$dir" 2>/dev/null || echo "unknown")
      if [ "$current_owner" != "33:33" ]; then
        chown 33:33 "$dir"
      fi
    done

    chmod 775 "{{ version }}/files"
    chmod 775 "{{ version }}/files_private"
  tags:
    - versioned_directory
  async: 300
  poll: 10
```

**Location:** [`drupal-deploy/ansible/deploy-playbook.yml`](drupal-deploy/ansible/deploy-playbook.yml) — "Create Versioned Directory Structure with correct ownership (ADO-320)" task

### Pattern 4: SSH Become Timeout (Ansible + SSM)

**Symptoms:** Ansible `become: sudo` task hangs or fails via SSM executor
**Root cause:** SSM does not allocate a TTY; `sudo` may prompt for password or stall
**Fix:** Add `async` and `poll` to all long-running tasks executed via SSM:

```yaml
- name: Long-running task
  shell: <command>
  become: true
  async: 600    # 10 minute budget
  poll: 30      # check every 30s
```

### Pattern 5: Blue Instance Online But ASG Status Not Updated

**Symptoms:** EC2 instance is running and healthy, but ASG shows `Desired=0` or `InService=0`
**Root cause:** ASG health check type mismatch (ALB vs EC2); 404 on target group; instance
  marked unhealthy due to transient health check failure during startup
**Diagnosis:**

```bash
# Check ASG instance lifecycle states
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names AHRQ-Stage-Blue-ASG \
  --query 'AutoScalingGroups[0].Instances[*].{Id:InstanceId,State:LifecycleState,Health:HealthStatus}'

# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn <arn> \
  --query 'TargetHealthDescriptions[*].{Target:Target.Id,State:TargetHealth.State,Reason:TargetHealth.Reason}'
```

**Fix options:**
1. Mark unhealthy instance to force replacement: `aws autoscaling set-instance-health --instance-id <id> --health-status Unhealthy`
2. Update ALB health check path to one that returns 200 during startup
3. Increase ALB health check grace period in ASG settings

---

## 7. Direct Server Access for Debugging

When Jenkins builds fail and console output isn't sufficient, SSH directly into the Jenkins
server to inspect workspace files, test commands manually, or debug Ansible/script issues.

### Access Pattern

```bash
# Step 1: SSH into Jenkins server as your AD user
ssh dietrich.gottfriedsc@ahrq.local@ahrq-jenkins-03.ahrq.local

# Step 2: Switch to the Jenkins deploy service account
sudo su - ahrqgovjenkins.deploy@ahrq.local
```

### What You Can Do Once Connected

```bash
# Inspect the Jenkins workspace for a failing build
ls -la /var/lib/jenkins/workspace/
ls -la /var/lib/jenkins/workspace/AHRQGOV/ahrqgov-drupal-site-deploy-stage/
ls -la /var/lib/jenkins/workspace/EHC/ehc-drupal-site-deploy-stage/

# Check the devops checkout (verify branch was checked out correctly)
cd /var/lib/jenkins/workspace/EHC/ehc-drupal-site-deploy-stage/devops
git log --oneline -5
git branch

# Test AWS credentials from the Jenkins agent context
export AWS_PROFILE=EHCDeploy
aws sts get-caller-identity

# Check SSH agent / loaded deploy keys
ssh-add -l

# Inspect EFS mount
df -h | grep efs

# Check Docker socket permissions
ls -la /var/run/docker.sock

# Check running Ansible processes (during a live build)
ps aux | grep ansible
ps aux | grep python
```

### When to Use Direct SSH Access

| Scenario | What to check |
|----------|---------------|
| Script fails with no output | Workspace files checked out correctly? `ls devops/drupal-deploy/` |
| Wrong devops branch checked out | `git log --oneline -3` in workspace devops dir |
| AWS credentials failure | `aws sts get-caller-identity` as deploy user |
| Ansible SSH key issues | `ssh-add -l` — verify deploy key is loaded |
| Build hangs silently | `ps aux | grep ansible` or `ps aux | grep python` |
| EFS mount issues | `df -h | grep efs` — verify mount points accessible |
| Docker socket permission errors | `ls -la /var/run/docker.sock` |

### Notes

- The service account `ahrqgovjenkins.deploy@ahrq.local` is the same identity Jenkins jobs
  run as — testing commands here exactly replicates the build environment
- Jenkins workspaces persist between builds unless cleaned; useful for post-mortem inspection
- Use `sudo` carefully — the service account has limited sudo rights per ADO-317

---

## 8. Job Configuration Change Workflow

```
1. Edit config.xml locally (in jenkins-configs/jobs/<folder>/<job>/config.xml)
2. Commit change to feature branch
3. Push branch to GitHub
4. Push config to live Jenkins via curl (see Section 3)
5. Verify in Jenkins UI: job SCM settings show new branch
6. Test trigger: run build manually once to verify
7. After validation: merge feature branch → main
8. Update remaining jobs pointing to old branch → main
```

---

## 9. Discovering Jobs on a Live Jenkins Instance

When you need to see what jobs exist (before editing configs, auditing branches, etc.):

```bash
# Load connection variables
set -a && source jenkins-config-sync/.env && set +a
export JENKINS_API_TOKEN=${JENKINS_API_TOKEN:-$(security find-generic-password -a jenkins -s "jenkins-api-token" -w)}

# List all top-level folders and jobs
curl -s -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "$JENKINS_URL/api/json?tree=jobs%5Bname%2Curl%2C_class%5D" | \
  python3 -c "import sys,json; [print(j['_class'].split('.')[-1], j['name']) for j in json.load(sys.stdin)['jobs']]"

# List all jobs inside a specific folder (e.g., EHC)
curl -s -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "$JENKINS_URL/job/EHC/api/json?tree=jobs%5Bname%2Curl%5D" | \
  python3 -c "import sys,json; [print(' -', j['name']) for j in json.load(sys.stdin)['jobs']]"
```

**Live EHC folder contents (verified Aug 2026):**
```
- ehc-drupal-build
- ehc-drupal-site-backup-production
- ehc-drupal-site-deploy-production-blue
- ehc-drupal-site-deploy-production-live
- ehc-drupal-site-deploy-stage
- ehc-drupal-site-promote-stage
- ehc-drupal-site-restore-integration
- ehc-drupal-tag-created
```

**⚠️ URL Encoding Required:** The `?tree=` query uses square brackets which break curl.
Always encode: `[` → `%5B`, `]` → `%5D`, `,` → `%2C`. Using unencoded brackets produces
curl exit code 3 ("bad/illegal URL format").

---

## 10. CSRF Crumb (If POST Requests Return 403)

Some Jenkins configurations enable CSRF protection, requiring a crumb token on all POST
requests. If a config.xml push returns HTTP 403 (not 401), fetch and include a crumb:

```bash
# Fetch crumb
CRUMB=$(curl -s -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "$JENKINS_URL/crumbIssuer/api/json" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['crumbRequestField']+':'+d['crumb'])")

echo "Crumb: $CRUMB"

# POST with crumb header
curl -s -X POST \
  -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  -H "$CRUMB" \
  -H "Content-Type: application/xml" \
  --data-binary @jenkins-configs/jobs/EHC/ehc-drupal-site-deploy-stage/config.xml \
  "$JENKINS_URL/job/EHC/job/ehc-drupal-site-deploy-stage/config.xml" \
  -w "\nHTTP Status: %{http_code}\n"
```

Note: The current Jenkins instance (`ahrq-jenkins-03`) accepted POST without a crumb in Aug 2026
testing (HTTP 200 without crumb header). Include crumb handling only if you start seeing 403s.

---

## 11. Pre-Deployment Checklist (Before Any Production Deployment)

Before triggering ANY production deployment:

- [ ] Staging validated for the same project (AHRQ, EHC, or PSO)
- [ ] Jenkins job devops branch points to `main` (or correct feature branch with all fixes)
- [ ] No stale launch configs for the current version (check `_00` suffix pattern)
- [ ] ASG names in `settings.yml` match actual ASG names in AWS
- [ ] AWS profile credentials valid (check expiry in `~/.aws/credentials`)
- [ ] ADO-317 sudoers configuration confirmed on production instances
- [ ] Rollback plan documented (previous LC version available, redeploy procedure known)

---

## 12. Quick Reference

### Key Files

| File | Purpose |
|------|---------|
| [`jenkins-config-sync/.env.example`](jenkins-config-sync/.env.example) | Template for local credentials file |
| [`jenkins-config-sync/export-jenkins-jobs.sh`](jenkins-config-sync/export-jenkins-jobs.sh) | Pull all job configs from Jenkins |
| [`jenkins-config-sync/import-jenkins-jobs.sh`](jenkins-config-sync/import-jenkins-jobs.sh) | Push all job configs to Jenkins (flat path — use curl for folders) |
| [`jenkins-config-sync/auto-sync.sh`](jenkins-config-sync/auto-sync.sh) | Export + git commit + push |
| [`jenkins-configs/jobs/`](jenkins-configs/jobs/) | All versioned job config.xml files |

### Jenkins URL Patterns

```
# Job info
GET  /job/<folder>/job/<name>/api/json

# Config read
GET  /job/<folder>/job/<name>/config.xml

# Config write
POST /job/<folder>/job/<name>/config.xml  (Content-Type: application/xml)

# Trigger build
POST /job/<folder>/job/<name>/build

# Trigger build with parameters
POST /job/<folder>/job/<name>/buildWithParameters?GIT_TAG_NAME=202607.02.01
```

### Credential IDs (referenced in config.xml)

| ID | Type | Used for |
|----|------|---------|
| `acheslowgithubtoken` | Username/Password | GitHub repos (all projects) |
| `ubuntu_ssh` | SSH Private Key | Internal Gitea (`ahrq-repo-int.ahrq.local`) |
| `ahrqgovjenkinsfile` | Secret File | Ansible private key file |
| `ahrqgovjenkinsdeployuser` | SSH Agent | Ansible deploy user SSH key |
