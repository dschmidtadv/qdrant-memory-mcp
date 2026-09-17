---
name: stagingdeployment
description: "Deploy AHRQGOV, EHC, or PSO Drupal to staging. Trigger Jenkins builds, generate Jira release notes from fixVersion, run the 5-stage blue-green pipeline, and verify post-deploy health. Covers tag resolution, ECR image handling, pre-deploy ticket validation, and operational safety (ADO-317/318/345/398)."
---

# EHC / AHRQGOV / PSO Drupal Staging Deployment

> **Scope:** This skill covers **staging deployments only**. Production deployment scripts (`ahrqgov-drupal-site-deploy-production-blue.sh`, `-production-live.sh`, and equivalents for EHC/PSO) exist but are **out of scope** for this document. Do not use these instructions for production.

> **Concurrency:** Each stage deploy Jenkins job has `concurrentBuild=false`. A second trigger **queues** rather than running in parallel. Do not panic-retrigger a deploy that appears stuck — check the Jenkins queue first.

> **Rollback:** There is **no automated rollback**. If a deployment fails mid-pipeline, the Blue ASG is left in a partially deployed state. Recovery is manual (see the Failure Recovery Checklist below).

This is the verified pipeline for these three Drupal projects, checked against Jenkins `config.xml` files, the `devops/drupal-deploy/` scripts, and the team's `.ai-memory/` notes. It corrects the old Confluence "Staging Deployment Guide" (page 289144965), which had fictionalized script names, shared ASG assumptions, and no mention of the pre-promote health gate. Facts below are tagged **[confirmed]** or **[unconfirmed — verify before relying on it]**; don't upgrade an unconfirmed item without re-checking the actual file.

---

## Instructions — How to Deploy to Staging

When the user asks to deploy a project to staging, follow these steps in order. The user MUST specify which project (`ahrqgov`, `ehc`, or `pso`) and a release tag (e.g. `202609.3.1`).

### Confirmation Gate (MANDATORY)

**Before triggering any Jenkins build, you MUST present a confirmation prompt to the user and wait for explicit approval.** Do not proceed without it.

Display this summary and ask the user to confirm:

```
╔══════════════════════════════════════════════════╗
║          STAGING DEPLOYMENT CONFIRMATION         ║
╠══════════════════════════════════════════════════╣
║  Project:     {PROJECT_NAME}                     ║
║  Tag:         {TAG}                              ║
║  Environment: STAGING                            ║
║  Jenkins Job: {JOB_PATH}                         ║
║  ASG Target:  {LIVE_ASG_NAME}                    ║
╠══════════════════════════════════════════════════╣
║  ⚠ This will deploy to STAGING (not production) ║
║  ⚠ No automated rollback available              ║
║  ⚠ Expected duration: 30-60 minutes             ║
╚══════════════════════════════════════════════════╝

Proceed with deployment? (yes/no)
```

**If the user says no:** Stop. Do not trigger the build.
**If the user says yes:** Proceed to Method 1/2/3 below.

### Prerequisites

Before starting, verify:
1. **Jenkins credentials** are available: `JENKINS_USER` and `JENKINS_API_TOKEN` environment variables must be set. If not, ask the user.
2. **Jenkins URL:** `http://ahrq-jenkins-03.ahrq.local:8080` (must be reachable from the local network or VPN).
3. **The release tag exists** in the project's GitHub repo and is associated with the `stage` branch.

### Method 1: Trigger via Jenkins API (Preferred)

Use this when Jenkins is reachable from your terminal.

**Step 1 — Resolve the project's Jenkins job path:**

| Project | Job Path |
|---------|----------|
| ahrqgov | `AHRQGOV/ahrqgov-drupal-site-deploy-stage` |
| ehc | `EHC/ehc-drupal-site-deploy-stage` |
| pso | `PSO-Drupal/pso-drupal-site-deploy-stage` |

**Step 2 — Verify Jenkins connectivity:**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  --user "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "http://ahrq-jenkins-03.ahrq.local:8080/api/json"
# Expected: 200
```

**Step 3 — Trigger the build and capture the queue item:**

```bash
# Replace {JOB_PATH} and {TAG} with actual values
# -D captures response headers; Location: header contains the queue URL
QUEUE_URL=$(curl -s -X POST -D - -o /dev/null \
  --user "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "http://ahrq-jenkins-03.ahrq.local:8080/job/{JOB_PATH}/buildWithParameters?GIT_TAG_NAME={TAG}" \
  | grep -i '^Location:' | sed 's/Location: *//;s/\r//')
echo "Queue item: $QUEUE_URL"
```

Example for EHC with tag `202609.3.1`:
```bash
QUEUE_URL=$(curl -s -X POST -D - -o /dev/null \
  --user "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "http://ahrq-jenkins-03.ahrq.local:8080/job/EHC/job/ehc-drupal-site-deploy-stage/buildWithParameters?GIT_TAG_NAME=202609.3.1" \
  | grep -i '^Location:' | sed 's/Location: *//;s/\r//')
```

**Step 4 — Wait for the build to start, then monitor:**

The POST returns a queue item, not a build number. Poll the queue item until Jenkins assigns a build number (the `executable.number` field):

```bash
# Poll queue item until build number is assigned (typically 5-30 seconds)
echo "Waiting for build to start..."
while true; do
  BUILD_NUM=$(curl -s --user "$JENKINS_USER:$JENKINS_API_TOKEN" \
    "${QUEUE_URL}api/json" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
exe = d.get('executable')
if exe and exe.get('number'):
    print(exe['number'])
" 2>/dev/null)
  if [ -n "$BUILD_NUM" ]; then
    echo "Build started: #$BUILD_NUM"
    break
  fi
  sleep 5
done

# Stream console output
curl -s --user "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "http://ahrq-jenkins-03.ahrq.local:8080/job/{JOB_PATH}/$BUILD_NUM/logText/progressiveText?start=0"
```

> **Note:** `lastBuild` right after the POST often returns the **previous** build. Always use the queue Location header to resolve the correct build number.

**Step 5 — Poll for deployment result:**

The build runs for 30–60 minutes. `result` is `null` while the build is running, so poll until it is set:

```bash
# Poll until result is non-null
while true; do
  RESULT=$(curl -s --user "$JENKINS_USER:$JENKINS_API_TOKEN" \
    "http://ahrq-jenkins-03.ahrq.local:8080/job/{JOB_PATH}/$BUILD_NUM/api/json" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
r = d.get('result')
if r is not None:
    dur = d.get('duration', 0) / 1000
    print('Status: %s  Duration: %.0fs' % (r, dur))
")
  if [ -n "$RESULT" ]; then
    echo "$RESULT"
    break
  fi
  echo "Build #$BUILD_NUM still running... ($(date +%H:%M:%S))"
  sleep 60
done
```

Expected: `Status: SUCCESS`. Typical duration: 30–60 minutes for full 5-stage pipeline.

### Method 2: Trigger via Git Tag Push (Webhook) — ⚠️ BROKEN

> **WARNING: This method does NOT trigger a functioning deploy-stage build.**
>
> The Generic Webhook Trigger on the deploy-stage jobs defines one variable `ref` (JSONPath `$.ref`), but `GIT_TAG_NAME` is a declared `StringParameterDefinition` — so on a webhook build it arrives **set but empty**. `verify-release.sh` line 5 tests `[ -z "${GIT_TAG_NAME+x}" ]`, which checks whether the variable is *set* (not whether it has a *value*). Set-but-empty takes the `else` branch, setting `TAG=""`, then `PROJECT_VERSION=""`, which hits "Empty version; Will not deploy" and exits 0.
>
> **Result:** A green build that deploys nothing. No error, no deployment.
>
> **Fix required:** Change `verify-release.sh` line 5 from `${GIT_TAG_NAME+x}` to `${GIT_TAG_NAME:-}` to check for a non-empty value instead of mere existence. Until this fix is applied, **use Method 1 (Jenkins API) or Method 3 (Jenkins UI) only.**

A tag push **does** correctly trigger the `{project}-drupal-tag-created` job (image build + ECR push), so the image will be built. But the deploy-stage job will silently no-op.

### Method 3: Jenkins UI (Manual Fallback)

1. Open `http://ahrq-jenkins-03.ahrq.local:8080`
2. Navigate to the project folder (AHRQGOV / EHC / PSO-Drupal)
3. Click `{project}-drupal-site-deploy-stage`
4. Click **Build with Parameters**
5. Set `GIT_TAG_NAME` to the release tag (e.g. `202609.3.1`)
6. Click **Build**
7. Monitor the **Console Output** for each stage

### Post-Deployment Verification

After the build shows SUCCESS:

1. **Verify ASG instances are healthy:**
```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-name "{LIVE_ASG_NAME}" \
  --query 'AutoScalingGroups[0].Instances[*].[InstanceId,HealthStatus,LifecycleState]' \
  --output table \
  --profile {AWS_PROFILE}
```

2. **Verify the site is responding:**
```bash
# AHRQGOV stage: https://stage.ahrq.gov
# EHC stage: https://stage.effectivehealthcare.ahrq.gov
# PSO stage: https://stage.pso.ahrq.gov
curl -s -o /dev/null -w "%{http_code}" https://stage.{site_domain}
# Expected: 200
```

3. **Verify scale-to-zero watchdog was re-enabled (ADO-398):**
```bash
aws autoscaling describe-tags \
  --filters "Name=auto-scaling-group,Values={BLUE_ASG_NAME}" "Name=key,Values=scale-to-zero:enabled" \
  --query 'Tags[0].Value' --output text \
  --profile {AWS_PROFILE}
# Expected: true
```

### Error Handling During Deployment

If any step fails, consult the **Troubleshooting** table at the end of this document. The most common failure modes are:
- **"Empty version"** → tag not on stage branch or already deployed. Cut a new tag.
- **Pre-promote health check failed** → SSM into blue instance and check Docker/Drupal health.
- **Container timeout** → check `docker logs` on the Jenkins agent.

### Failure Recovery Checklist

If a deployment fails at **any stage after Stage 1**, the watchdog tag may be left disabled. The `restore_watchdog()` trap in Stage 1 only fires if Stage 1 itself errors — failures in Stages 2–4 do NOT trigger it, and Stage 5's re-enablement never runs. This leaves `scale-to-zero:enabled=false` on the Blue ASG indefinitely.

**After any failed deployment, always run this checklist:**

1. **Re-enable the scale-to-zero watchdog on the Blue ASG:**
```bash
# Replace {BLUE_ASG_NAME} and {AWS_PROFILE} with project values from the tables above
aws autoscaling create-or-update-tags \
  --tags "ResourceId={BLUE_ASG_NAME},ResourceType=auto-scaling-group,Key=scale-to-zero:enabled,Value=true,PropagateAtLaunch=false" \
  --region us-east-1 \
  --profile {AWS_PROFILE}
```

2. **Verify the tag was restored:**
```bash
aws autoscaling describe-tags \
  --filters "Name=auto-scaling-group,Values={BLUE_ASG_NAME}" "Name=key,Values=scale-to-zero:enabled" \
  --query 'Tags[0].Value' --output text \
  --profile {AWS_PROFILE}
# Expected: true
```

3. **Check if stale Blue instances are still running:**
```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-name "{BLUE_ASG_NAME}" \
  --query 'AutoScalingGroups[0].Instances[*].[InstanceId,LifecycleState]' \
  --output table \
  --profile {AWS_PROFILE}
```
If instances are running, the watchdog Lambda will scale them to zero at the next 5-minute interval now that the tag is re-enabled.

4. **Check Jenkins build log** for the specific failure point (which stage, which error).

5. **Do NOT re-trigger the build** without first checking the Jenkins queue — `concurrentBuild=false` means a stuck build blocks the queue.

---

## Jira Integration — Release Notes & Pre-Deploy Validation

This section integrates the `jira` CLI (from the `jira-manager` skill) into the deployment workflow. It enables two capabilities:

1. **Generate release notes** from Jira tickets tagged to a fixVersion
2. **Pre-deployment validation** — verify all tickets in the release are in the correct state

### Prerequisites

- The `jira` CLI must be installed (`which jira` → `~/.local/bin/jira`)
- Jira credentials configured in `.env` (see jira-manager skill for setup)
- The Jira project must use **fixVersion** fields on tickets (e.g., `Deployment 202609.01`)

### Jira Project Keys by Drupal Project

| Drupal Project | Jira Project Key | Example fixVersion |
|---------------|-----------------|-------------------|
| AHRQGOV | `AQD` | `Deployment 202609.01` |
| EHC | `EHCD` | `Deployment 202609.01` |
| PSO | `PSOD` | `Deployment 202609.01` |

> **Note:** Fix version names in Jira do NOT match the git tag format. The git tag is `202609.3.1`; the Jira fixVersion is typically `Deployment 202609.01` or similar. Ask the release manager for the exact fixVersion string if unsure.

### Step 1: Generate Release Notes from fixVersion

Use the `jira release-notes` command to pull all tickets tagged to a specific fixVersion and generate formatted release notes:

```bash
# Generate release notes for a specific fixVersion
jira --project EHCD release-notes \
  --version "Deployment 202609.01" \
  --strategy fixversion \
  --output release-notes-202609.01.md
```

This queries Jira with:
```
JQL: project = EHCD AND fixVersion = "Deployment 202609.01" ORDER BY issuetype ASC, priority DESC
```

**Output format (Markdown):**
```markdown
## Release Deployment 202609.01

### Features
- [EHCD-3293](https://cmext.ahrq.gov/jira/browse/EHCD-3293): Implement GitHub Release automation
- [EHCD-3301](https://cmext.ahrq.gov/jira/browse/EHCD-3301): Add SSM-first deployment support

### Bug Fixes
- [EHCD-3084](https://cmext.ahrq.gov/jira/browse/EHCD-3084): Search pages not cached
- [EHCD-3102](https://cmext.ahrq.gov/jira/browse/EHCD-3102): 504 timeout on taxonomy pages

### Tasks
- [EHCD-3290](https://cmext.ahrq.gov/jira/browse/EHCD-3290): Update Drupal core to 10.3

**Total Issues:** 12
**Release Date:** 2026-09-18
```

**Alternative strategies** (when fixVersion isn't used):
```bash
# By label (e.g., tickets labeled "release-202609")
jira --project EHCD release-notes --version "202609" --strategy label

# By epic
jira --project EHCD release-notes --version "EHCD-3000" --strategy epic
```

### Step 2: Pre-Deployment Ticket Validation

Before triggering the Jenkins deploy, verify that all tickets in the release are in an acceptable state (e.g., "Resolved" or "Closed" — not "Open" or "In Progress"):

```bash
# Search for tickets in the fixVersion that are NOT resolved
jira --project EHCD search \
  --jql 'project = EHCD AND fixVersion = "Deployment 202609.01" AND status NOT IN ("Resolved", "Closed", "Done")' \
  --max 50
```

**If tickets are found:** These are unresolved tickets tagged to this release. The agent should:
1. List the unresolved tickets with their status and summary
2. Warn the user: "There are N unresolved tickets in this fixVersion. Deploying may ship incomplete work."
3. Ask whether to proceed or abort

**If no tickets are found:** All tickets are resolved — safe to proceed with deployment.

### Step 3: Post-Deployment Comment (Optional)

After a successful deployment, add a comment to each ticket in the release noting the deployment:

```bash
# Get all ticket keys in the fixVersion
TICKETS=$(jira --project EHCD search \
  --jql 'project = EHCD AND fixVersion = "Deployment 202609.01"' \
  --max 100 --json | python3 -c "
import sys, json
data = json.load(sys.stdin)
for issue in data.get('issues', []):
    print(issue['key'])
")

# Comment on each ticket
for TICKET in $TICKETS; do
  jira --project EHCD comment "$TICKET" \
    --body "h2. Deployed to Staging

Deployed as part of fixVersion *Deployment 202609.01* to staging environment.

||Detail||Value||
|Tag|202609.3.1|
|Environment|Stage|
|Date|$(date -u +'%Y-%m-%d %H:%M UTC')|
|Jenkins Build|See Jenkins console for build details|"
done
```

### Full Deployment Workflow with Jira Integration

When the user says "deploy EHC tag 202609.3.1 to staging", the complete flow is:

1. **Jira pre-flight:** `jira check` — verify Jira connectivity
2. **Generate release notes:** `jira --project EHCD release-notes --version "Deployment 202609.01"` — show the user what's in this release
3. **Validate ticket states:** Search for unresolved tickets — warn if any exist
4. **Trigger Jenkins build:** `curl -X POST .../buildWithParameters?GIT_TAG_NAME=202609.3.1`
5. **Monitor build:** Stream console output until SUCCESS
6. **Post-deploy verification:** Check ASG health, site HTTP response, watchdog tags
7. **Post-deploy Jira update:** Comment on tickets noting the deployment (optional, ask user)

---

## Release Process

### Step 1: Cut the Release Tag **[confirmed]**

Format: `YYYYMM.ReleaseNumber.DeployNumber` (e.g. `202609.3.1`). Push it to the project's stage-tracked branch/repo.

### Step 2: Tag-Created Job Builds and Pushes the Image **[confirmed]**

The `{project}-drupal-tag-created` Jenkins job fires on tag push, builds the Docker image, and pushes a single tag to ECR.

- ECR registry: `406380712964.dkr.ecr.us-east-1.amazonaws.com`
- Push function: `push_to_ecr()` in `drupal-deploy/ecr-functions.sh`
- ECR auth always uses `AWS_PROFILE=default` (AHRQGOV account) regardless of the project's deploy profile

### Step 3: Stage Deploy Job Runs the 5-Stage Pipeline **[confirmed]**

The `{project}-drupal-site-deploy-stage` Jenkins job orchestrates the full blue-green deployment.

---

## Tag Resolution Logic **[confirmed]**

Source: `drupal-deploy/verify-release.sh`

> **Known bug:** Line 5 uses `[ -z "${GIT_TAG_NAME+x}" ]` which tests whether the variable is *set*, not whether it has a non-empty *value*. On webhook-triggered builds, `GIT_TAG_NAME` is declared as a `StringParameterDefinition` and arrives set-but-empty, so the test takes the else branch with `TAG=""` → "Empty version; Will not deploy" (silent no-op). This is why Method 2 (tag push webhook) does not work for deploy-stage jobs. Fix: change to `[ -z "${GIT_TAG_NAME:-}" ]`.

1. If `GIT_TAG_NAME` is set **and non-empty** (passed via `buildWithParameters`), use it as `TAG`.
2. If `GIT_TAG_NAME` is unset or empty, fall back to `git tag | sort -g | tail -1` (latest tag numerically).
3. Verify the tag is associated with a branch. If it is not associated with any branch, the deployment **fails hard** (ADO-320 fix — prevents stale/dangling tag redeploys that exhaust launch config suffix retries).
4. Check whether the version is already deployed on the live ASG. If the tag version already matches a running instance's tag, the deployment exits cleanly with "version is already deployed" (no-op by design).
5. Export `PROJECT_VERSION=$TAG` for downstream stages.

> **Important:** The Jenkins entry scripts set `PROJECT_VERSION=` (blank) by design. The actual version is resolved by `verify-release.sh`, not hardcoded.

---

## 5-Stage Pipeline

All three projects execute the same 5 scripts from `drupal-deploy/`:

| Stage | Script | What It Does |
|-------|--------|--------------|
| 1 | `1_blue_predeploy.sh` | Loads AWS creds, wakes up ASG (ADO-318), disables scale-to-zero watchdog on Blue ASG (ADO-398), runs Ansible predeploy |
| 2 | `2_blue_deploy.sh` | Calls `run_drupal_deploy deploy` — pulls `drupal-deploy:latest` from ECR, runs deployment container with `STEP=deploy` |
| 3 | `3_blue_site_restore.sh` | Database/content restoration on blue instances |
| 4 | `4_live_prepromote.sh` | ELB health gate (ADO-345): validates blue target group health. Blocks promotion if targets are unhealthy. |
| 5 | `5_live_promote.sh` | Calls `run_drupal_deploy promote` — generates live userdata, creates live launch config, updates live ASG, scales up, verifies health, scales down old. Re-enables scale-to-zero watchdog (ADO-398). |

### The `run_drupal_deploy` Function **[confirmed]**

Source: `drupal-deploy/common.sh` (line ~628)

This function:
1. Authenticates with ECR (`authenticate_ecr`)
2. Pulls the `drupal-deploy:latest` image from ECR
3. Detects `RELEASE_TYPE` (live deploy vs AMI refresh)
4. Runs a Docker container in detached mode with:
   - AWS credentials mounted (`.aws/config`, `.aws/credentials`)
   - Project `settings.yml` mounted
   - SSH key mounted (only when `SSM_ENABLED != true`)
   - Environment variables: `PROJECT`, `ENVIRONMENT`, `VERSION`, `STEP`, `RELEASE_TYPE`, `SSM_ENABLED`, `PROJECT_ASG`, `AMI_ID`
5. Streams container logs to Jenkins console in real-time
6. Waits with a 15-minute timeout (`timeout 900 docker wait`)
7. Returns the **container's actual exit code** (ADO-320 fix — previous implementation silently masked container failures)

---

## Per-Project Configuration

### Jenkins Entry Scripts

> **⚠️ Drift warning:** The `jenkins/*.sh` files in this repo are **mirrors** of the scripts embedded in each Jenkins job's `config.xml`. The actual runtime scripts live inside Jenkins config.xml and may have diverged. The canonical source of truth for what Jenkins executes is the config.xml, exported to `drupal-deploy/jenkins-config-sync/jenkins-configs/jobs/`. When in doubt, check the config.xml export — not the `jenkins/*.sh` mirror.

| Project | Entry Script (repo mirror) | AWS Profile | ASG Name |
|---------|---------------------------|-------------|----------|
| AHRQGOV | `jenkins/ahrqgov-drupal-site-deploy-stage.sh` | `default` | `AHRQ-Stage-ASG` |
| EHC | `jenkins/ehc-drupal-site-deploy-stage.sh` | `EHCDeploy` | `EHC-Stage-ASG` |
| PSO | `jenkins/pso-drupal-site-deploy-stage.sh` | `PSODeploy` | `PSO-Stage-ASG` |

### Blue ASG Names (from settings.yml)

| Project | Live ASG | Blue ASG |
|---------|----------|----------|
| AHRQGOV | `AHRQ-Stage-ASG` | `AHRQ-Stage-Blue-ASG` |
| EHC | `EHC-Stage-ASG` | `EHC-Stage-Blue-ASG` |
| PSO | `PSO-Stage-ASG` | `PSO-Stage-Blue-ASG` |

### Settings Files

- `drupal-deploy/ahrqgov/settings.yml` — AHRQ stage/prod config (EFS mounts, RDS, security groups, AMI, instance type)
- `drupal-deploy/ehc/settings.yml` — EHC stage/prod config (includes PEERCOMMENTS_BUCKET env vars, uses SSM Parameter Store for MySQL creds)
- `drupal-deploy/pso/settings.yml` — PSO stage/prod config

### Per-Project Differences

| Feature | AHRQGOV | EHC | PSO |
|---------|---------|-----|-----|
| Sources `common.sh` in entry script | No (older inline style) | Yes | No (older inline style) |
| Nessus agent re-link | No | No | Yes — unlinks and re-links to `PSO-Stage-Autoscaled` group |
| Scale-to-zero wakeup in entry script | No (handled in `1_blue_predeploy.sh`) | No (handled in `1_blue_predeploy.sh`) | Yes — explicit `wakeup.sh` call for Live ASG before deploy |
| S3 session bucket | Not set | `ehc-ssm-sessions-bucket` | `pso-staging-bucket` |
| MySQL credential source | Hardcoded in settings.yml | SSM Parameter Store (`/ehc/stage/mysql_*`) | Hardcoded in settings.yml |

---

## Operational Safety Features

### SSM-First Mode (ADO-317) **[confirmed]**

`1_blue_predeploy.sh` exports `SSM_ENABLED=true`. Ansible connects to instances via AWS Systems Manager by default. SSH key is mounted as fallback only (non-fatal if missing when SSM is enabled).

### ASG Wakeup (ADO-318) **[confirmed]**

`1_blue_predeploy.sh` calls `wake_up_asg "$PROJECT_ASG" 480` — wakes up idle ASGs scaled to zero, with an 8-minute timeout. Deployment aborts if wakeup fails.

### Pre-Promote ELB Health Gate (ADO-345) **[confirmed]**

`4_live_prepromote.sh` calls `validate_elb_health "$BLUE_ASG_NAME" "pre-promote"`. If blue target group instances are unhealthy, promotion is blocked with:
```
ERROR: Pre-promote health check failed. Aborting promotion.
ACTION: Investigate why Blue TG targets are unhealthy and fix manually before retrying.
```

### Scale-to-Zero Watchdog Protection (ADO-398) **[confirmed]**

The idle watchdog Lambda runs every 5 minutes and scales idle Blue ASGs to zero. During deployment (Stages 1–5), the Blue ASG receives no production traffic and appears "idle" to the watchdog, which would kill the instance mid-deployment.

- **Stage 1:** Disables watchdog by setting `scale-to-zero:enabled=false` tag on Blue ASG
- **Stage 5:** Re-enables watchdog by setting `scale-to-zero:enabled=true` after successful promotion
- **Error trap:** `restore_watchdog()` trap handler in Stage 1 re-enables the tag even on failure

### Container Exit Code Propagation (ADO-320) **[confirmed]**

`run_drupal_deploy()` captures the container's actual exit code via `docker wait` stdout. Previous implementation redirected this to `/dev/null` and only checked `$?` of the wait command itself, silently masking all container failures (including the "MAXIMUM ATTEMPTS used for creating launch config exceeded" error in build #878).

---

## ECR Cross-Account Authentication **[confirmed]**

The ECR registry lives in the AHRQGOV account (`406380712964`). All three projects authenticate to ECR using `AWS_PROFILE=default` regardless of the deployment profile:

- `ecr-functions.sh` line 56: `AWS_PROFILE=default aws ecr get-login-password`
- `common.sh` `authenticate_ecr()`: Uses `ECR_PROFILE="${ECR_PROFILE:-default}"`

This means EHC (`EHCDeploy`) and PSO (`PSODeploy`) deploy profiles do **not** need ECR permissions — they authenticate to ECR via the default/AHRQGOV profile.

---

## Key File Reference

| File | Purpose |
|------|---------|
| `jenkins/{project}-drupal-site-deploy-stage.sh` | Jenkins entry point — sets project vars, runs verify-release, calls 5 stages |
| `jenkins/{project}-drupal-tag-created/` | Jenkins job config — fires on tag push, builds Docker image |
| `drupal-deploy/verify-release.sh` | Tag resolution, branch association check, already-deployed detection |
| `drupal-deploy/common.sh` | Shared functions: `load_aws_profile`, `authenticate_ecr`, `run_drupal_deploy`, `wake_up_asg`, `validate_elb_health`, `setup_ssh_key` |
| `drupal-deploy/ecr-functions.sh` | `push_to_ecr()` and `pull_from_ecr()` with retry logic |
| `drupal-deploy/1_blue_predeploy.sh` | Stage 1: AWS creds, ASG wakeup, watchdog disable, Ansible predeploy |
| `drupal-deploy/2_blue_deploy.sh` | Stage 2: `run_drupal_deploy deploy` |
| `drupal-deploy/3_blue_site_restore.sh` | Stage 3: Database/content restoration |
| `drupal-deploy/4_live_prepromote.sh` | Stage 4: ELB health gate |
| `drupal-deploy/5_live_promote.sh` | Stage 5: `run_drupal_deploy promote`, watchdog re-enable |
| `drupal-deploy/{project}/settings.yml` | Per-project YAML: ASG names, EFS mounts, RDS, security groups, AMI, ports |
| `drupal-deploy/export_aws_profile.sh` | Extracts AWS credentials from Jenkins credential store |

---

## Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| "Empty version; Will not deploy" | `verify-release.sh` found no tags or version already deployed | Check `git tag` output; verify tag is on stage branch |
| "Tag is not associated with any branch" | Dangling/stale tag (ADO-320 gate) | Cut a new incrementing version tag |
| "version is already deployed" | Live ASG instance already has this version tag | Cut a new deploy number (e.g. `.2`) |
| "Failed to wake up ASG" | Live ASG didn't reach InService within 8 min | Check ASG activity, instance health, launch template |
| "Pre-promote health check failed" | Blue TG targets are unhealthy after deploy | SSH/SSM into blue instance, check Docker container, Drupal health |
| Container timeout (15 min) | Python orchestrator hung | Check container logs, ASG scaling events, launch config creation |
| "MAXIMUM ATTEMPTS used for creating launch config exceeded" | Same tag deployed repeatedly without incrementing | Cut new tag; clean up stale launch configs |
| Watchdog kills blue instance mid-deploy | ADO-398 tag not set or Lambda fired between tag write and check | Verify `scale-to-zero:enabled=false` on Blue ASG during deploy |
