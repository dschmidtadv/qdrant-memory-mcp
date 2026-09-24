---
name: stagingdeployment
description: "Deploy AHRQGOV, EHC, or PSO Drupal to staging. Trigger Jenkins builds, generate Jira release notes from fixVersion, run the 5-stage blue-green pipeline, and verify post-deploy health. Covers tag resolution, ECR image handling, pre-deploy ticket validation, and operational safety (ADO-317/318/345/398)."
---

# EHC / AHRQGOV / PSO Drupal Staging Deployment

> **Scope:** This skill covers **staging deployments only**. Production deployment jobs (`*-drupal-site-deploy-production-blue`, `-production-live`) exist but are **out of scope** for this document. Do not use these instructions for production.

> **Concurrency:** Each stage deploy Jenkins job has `concurrentBuild=false` (verified in all three config.xml files). A second trigger **queues** rather than running in parallel. Do not panic-retrigger a deploy that appears stuck — check the Jenkins queue first.

> **Rollback:** There is **no automated rollback**. If a deployment fails mid-pipeline, the Blue ASG is left in a partially deployed state. Recovery is manual (see the Failure Recovery Checklist below).

This is the verified pipeline for these three Drupal projects. Facts below are tagged **[confirmed]** or **[unconfirmed — verify before relying on it]**; don't upgrade an unconfirmed item without re-checking the actual file.

**Verification pass 2026-09-21** against `~/apps/devops` (`github.com/AHRQ/web-services-devops`), branch `ADO-345-shell-integration` at commit `ac5425d`. Files read directly: `4_live_prepromote.sh`, `5_live_promote.sh`, `verify-release.sh`, `run_drupal_deploy()` in `common.sh`, and the three deploy-stage plus three tag-created `config.xml` files. That pass corrected the tag-resolution logic, the config.xml location and line numbers, the credential list, and the ADO-398 error-trap claim, and found two live bugs (see Known Bugs). **Third pass, same day:** both bugs merged via PR #82 (commit `a25916e`) onto `ADO-345-shell-integration` and pushed to origin — not yet confirmed live in Jenkins, not yet merged to `main`. Also added the `create-release.yml`/`open-stage-pr.yml` GitHub Release automation to AHRQGOV and PSO (committed locally, unpushed) and corrected the Trigger Plumbing section against directly-read `JenkinsTrigger.yml` files.

---

## Tag Format — zero-pad both segments

The release tag format is `YYYYMM.NN.NN` with **two digits in each of the last two segments**: `202609.01.01`, not `202609.1.1`.

This matters because `verify-release.sh:13` filters candidate tags with `^[0-9]{6}\.[0-9]{2}\.[0-9]{2}$`. A tag like `202609.3.1` does not match and will never be selected by the auto-detect fallback, even though the AHRQGOV webhook regex (`\d{6}\.\d+\.\d+`) would accept it. Always zero-pad.

---

## Instructions — How to Deploy to Staging

When the user asks to deploy a project to staging, follow these steps in order. The user MUST specify which project (`ahrqgov`, `ehc`, or `pso`) and a release tag (e.g. `202609.01.01`).

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
2. **Jenkins URL:** `http://ahrq-jenkins-03.ahrq.local:8080` (must be reachable from the local network or VPN). Older docs referencing `ahrq-jenkins-02` are out of date.
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

Example for EHC with tag `202609.01.01`:
```bash
QUEUE_URL=$(curl -s -X POST -D - -o /dev/null \
  --user "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "http://ahrq-jenkins-03.ahrq.local:8080/job/EHC/job/ehc-drupal-site-deploy-stage/buildWithParameters?GIT_TAG_NAME=202609.01.01" \
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

> Keep `%`-formatting in these inline Python blocks. An f-string with double-quoted keys inside a single-quoted shell string is a SyntaxError below Python 3.12.

Expected: `Status: SUCCESS`. Typical duration: 30–60 minutes for full 5-stage pipeline.

### Method 2: Trigger via Git Tag Push (Webhook) — ⚠️ status changed, verify before trusting

> **Update, third pass 2026-09-21:** the fix described below has been merged and pushed. PR #82 (commit `a25916e`) changed `verify-release.sh` line 5 to `[ -z "${GIT_TAG_NAME:-}" ] || [ "${GIT_TAG_NAME}" = "" ]` on branch `ADO-345-shell-integration`, pushed to `origin`. **Not merged to `main`.** `verify-release.sh` is sourced directly from the checked-out repo at build time (not a job-config artifact), so this should take effect on Jenkins's next build *if* Jenkins is actually building off `ADO-345-shell-integration` for these jobs — which is itself unconfirmed (see Open Items). Treat Method 2 as still unverified rather than confirmed-working until a real webhook-triggered build is observed to deploy successfully post-merge.
>
> Original finding, still useful for context: each deploy-stage job's Generic Webhook Trigger declares exactly one generic variable, `<key>ref</key>` (JSONPath `$.ref`), with `regexpFilterText` of `$ref`. It never populates `GIT_TAG_NAME`. `GIT_TAG_NAME` **is** a declared `StringParameterDefinition` on all three jobs (config.xml line 14), so on a webhook build it arrives **set but empty** — the old `${GIT_TAG_NAME+x}` check took the `else` branch on this, setting `TAG=""`, then `PROJECT_VERSION=""`, hitting "Empty version; Will not deploy" and exiting 0: a green build that deployed nothing, no error.
>
> Until a post-merge webhook build is verified, **continue to prefer Method 1 (Jenkins API) or Method 3 (Jenkins UI).**

A tag push **does** correctly trigger the `{project}-drupal-tag-created` job (image build + ECR push), so the image will be built. But the deploy-stage job will silently no-op.

Related, same file: `verify-release.sh:3` is `set -euo >/dev/null`. The `-o` gets no argument, so this does **not** enable `pipefail` — it just prints the option list to /dev/null. Flagged as broken error handling in the 2026-04-30 review; still present.

### Method 3: Jenkins UI (Manual Fallback)

1. Open `http://ahrq-jenkins-03.ahrq.local:8080`
2. Navigate to the project folder (AHRQGOV / EHC / PSO-Drupal)
3. Click `{project}-drupal-site-deploy-stage`
4. Click **Build with Parameters**
5. Set `GIT_TAG_NAME` to the release tag (e.g. `202609.01.01`)
6. Click **Build**
7. Monitor the **Console Output** for each stage

EHC's job has a second parameter, `DOCKER_IMAGE_TAG` (config.xml line 18), not present on AHRQGOV or PSO. Check it when an EHC build behaves unexpectedly.

Job 1 (`{project}-drupal-tag-created`) **cannot** be triggered this way — it has no build parameters on any project. Re-running it just re-derives the tag.

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
`verify-release.sh` filters on `LifecycleState==InService` for its own check (regression fix, ADO-321). A green Jenkins build alone is not proof anything deployed.

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
- **"Empty version"** → webhook-triggered build (Method 2 bug), tag not on stage branch, or already deployed.
- **Pre-promote health check failed** → SSM into blue instance and check Docker/Drupal health.
- **Container timeout** → check `docker logs` on the Jenkins agent.
- **Promotion died with no explanation** → stage 5's `set -e` bug (see Known Bugs); read the container logs.

### Failure Recovery Checklist

If a deployment fails at **any stage after Stage 1**, the watchdog tag is left disabled. The `restore_watchdog()` trap in Stage 1 only fires if Stage 1 itself errors — failures in Stages 2–5 do NOT trigger it, and Stage 5's re-enablement runs only on success. This leaves `scale-to-zero:enabled=false` on the Blue ASG indefinitely, usually with no message saying so.

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

## Known Bugs (open as of 2026-09-21)

### 1. Webhook deploys silently no-op

`verify-release.sh:5` uses `${GIT_TAG_NAME+x}`. See Method 2. Fix: `${GIT_TAG_NAME:-}`.

**Status, third pass 2026-09-21:** merged. PR #82 (commit `a25916e`) landed the fix on `ADO-345-shell-integration` and is **pushed to origin** — no longer a local-only change. Current file reads `if [ -z "${GIT_TAG_NAME:-}" ] || [ "${GIT_TAG_NAME}" = "" ]; then` (belt-and-suspenders: the empty-string check is redundant with `:-` but harmless). **Not merged to `main`.** The merge commit's own note says this is a "repo-only change; requires `jenkins-config-sync/import-jenkins-jobs.sh` or manual Jenkins UI update before live jobs are affected" — but `verify-release.sh` is a script Jenkins *sources* from the checked-out repo at build time (see Per-Project Configuration), not a job-config artifact, so if Jenkins is in fact building off `ADO-345-shell-integration` (unconfirmed — see Open Items), this fix should already be live on the next build off that branch without any import step. That distinction was not spelled out in the merge commit; confirm directly with a real build before assuming either way.

### 2. Stage 5's failure branch is unreachable

`5_live_promote.sh` sets `set -euo pipefail` (line 2), then:

```bash
run_drupal_deploy promote    # line 43
PROMOTE_EXIT=$?              # line 44
```

`run_drupal_deploy()` returns the container's real exit code on failure (ADO-320). Under `set -e`, a non-zero return from that unguarded call aborts the script at line 43, so `PROMOTE_EXIT` is only ever 0 and the entire `else` branch (lines 68–73) never executes. On a failed promotion the operator never sees `=== Stage 5 Promotion Failed ===` or the instruction to restore `scale-to-zero:enabled=true` — the script just dies, watchdog still disabled.

Same bug class as Issue 9 from the 2026-09-18 session (commit `96465b0`). Fix: `run_drupal_deploy promote || PROMOTE_EXIT=$?`. Compare `4_live_prepromote.sh`, which gets it right with `if ! validate_elb_health ...; then`.

### 3. `sort -g` tag poisoning — fixed on EHC only

The original fallback used `git tag | sort -g | tail -1`. General numeric sort mis-ranks release tags, and it caused two separate incidents in 2026-09:

- **AMI compound tags.** The AMI bake pipeline pushes tags like `202609.01.01.ami02c23f8c0722bb0af` into the application repo. `sort -g` ranks the compound tag higher, so the deploy resolves a version whose ECR image doesn't exist and `docker pull` 404s.
- **A malformed tag.** A stray `2202608.01.03` (extra leading `2`) sorted above every valid `2026xx.xx.xx` tag, so build #228 pushed `ehc-drupal:2202608.01.03` to ECR, built from the wrong commit.

The fix filters to release-format tags before sorting by version:

```bash
TAG=$(git tag | grep -E '^[0-9]{6}\.[0-9]{2}\.[0-9]{2}$' | sort -V | tail -1)
```

Replication status, re-verified 2026-09-21 (third pass, same day):

| Location | State |
|---|---|
| `drupal-deploy/verify-release.sh:13` | Fixed |
| `jenkins-configs/jobs/EHC/ehc-drupal-tag-created/config.xml` (135, 159) | Fixed |
| `jenkins-configs/jobs/AHRQGOV/ahrqgov-drupal-tag-created/config.xml` (134, 151) | Fixed — now `sort -V` with the release-format filter |
| `jenkins-configs/jobs/PSO-Drupal/pso-drupal-tag-created/config.xml` (114, 154, 176) | Fixed — all three places now `sort -V` |

**Status, third pass 2026-09-21: merged and pushed, not yet confirmed live.** PR #82 (commit `a25916e`) landed both this and the verify-release.sh fix on `ADO-345-shell-integration`, pushed to origin — no longer local-only. Still **not merged to `main`**, and `jenkins-configs/` is a **nightly export FROM Jenkins** (`jenkins-config-sync/auto-sync.sh`), not a source Jenkins reads — a commit here, even pushed, does not by itself change a live Jenkins job's config.xml. The merge commit's own message flags this: "repo-only change; requires `jenkins-config-sync/import-jenkins-jobs.sh` or manual Jenkins UI update before live jobs are affected." **Confirm directly against Jenkins (API or UI), or run the import step, before treating AHRQGOV/PSO as no longer exposed to this failure mode.**

> **LIVE CONFIRMATION — Build #328 (PSO, 2026-09-21):** Jenkins console shows `+++ sort -g` still executing in `verify-release.sh` on the PSO deploy-stage job. The `sort -V` fix from PR #82 is **confirmed NOT live** on PSO's Jenkins instance. It worked this time because `202609.01.01` has no competing `.ami{hash}` or malformed tags in the PSO repo at this moment. **Do not assume safety — run `jenkins-config-sync/import-jenkins-jobs.sh` or update the PSO job config.xml via Jenkins UI before the next deploy.**

---

## Jira Integration — Release Notes & Pre-Deploy Validation

This section integrates the `jira` CLI (from the `jira-manager` skill) into the deployment workflow. It enables two capabilities:

1. **Generate release notes** from Jira tickets tagged to a fixVersion
2. **Pre-deployment validation** — surface ticket states before deploying

### Prerequisites

- The `jira` CLI must be installed (`which jira` → `~/.local/bin/jira`)
- Jira credentials configured in `.env` (see jira-manager skill for setup)
- The Jira project must use **fixVersion** fields on tickets (e.g., `Deployment 202609.01`)

### Jira Project Keys by Drupal Project **[unconfirmed — never re-verified against Jira]**

| Drupal Project | Jira Project Key | Example fixVersion |
|---------------|-----------------|-------------------|
| AHRQGOV | `AQD` | `Deployment 202609.01` |
| EHC | `EHCD` | `Deployment 202609.01` |
| PSO | `PSOD` | `Deployment 202609.01` |

> **Note:** Fix version names in Jira do NOT match the git tag format. The git tag is `202609.01.01`; the Jira fixVersion is typically `Deployment 202609.01`. Ask the release manager for the exact fixVersion string if unsure.

### Step 1: Generate Release Notes from fixVersion

```bash
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

### Bug Fixes
- [EHCD-3084](https://cmext.ahrq.gov/jira/browse/EHCD-3084): Search pages not cached

**Total Issues:** 12
**Release Date:** 2026-09-18
```

**Alternative strategies** (when fixVersion isn't used):
```bash
jira --project EHCD release-notes --version "202609" --strategy label
jira --project EHCD release-notes --version "EHCD-3000" --strategy epic
```

### Step 2: Pre-Deployment Ticket Validation

```bash
jira --project EHCD search \
  --jql 'project = EHCD AND fixVersion = "Deployment 202609.01" AND status NOT IN ("Resolved", "Closed", "Done")' \
  --max 50
```

**Unresolved tickets do NOT block a staging deploy.** Staging is where validation happens — 15 of 18 unresolved was normal on the 2026-09 EHC push. List the unresolved tickets with status and summary, state the count, and proceed unless the user says otherwise. Apply a hard ticket-readiness gate only to **production** deploys.

### Step 3: Post-Deployment Comment (Optional)

```bash
TICKETS=$(jira --project EHCD search \
  --jql 'project = EHCD AND fixVersion = "Deployment 202609.01"' \
  --max 100 --json | python3 -c "
import sys, json
data = json.load(sys.stdin)
for issue in data.get('issues', []):
    print(issue['key'])
")

for TICKET in $TICKETS; do
  jira --project EHCD comment "$TICKET" \
    --body "h2. Deployed to Staging

Deployed as part of fixVersion *Deployment 202609.01* to staging environment.

||Detail||Value||
|Tag|202609.01.01|
|Environment|Stage|
|Date|$(date -u +'%Y-%m-%d %H:%M UTC')|
|Jenkins Build|See Jenkins console for build details|"
done
```

### Full Deployment Workflow with Jira Integration

When the user says "deploy PSO/EHC/AHRQGOV to staging for fixVersion Deployment YYMM.NN", the complete flow is:

1. **Cut the release via `create-release.yml`** — Go to GitHub Actions → `create-release.yml` → Run workflow (auto-increments tag, pushes via `GH_DEPLOY_PAT`, opens GitHub prerelease). Verify Job 1 fires within 30s. If `create-release.yml` is unavailable, use the manual `git tag` fallback from the Release Process section AND create the GitHub Release manually with `gh release create`.
2. **Jira pre-flight:** `jira check` — verify Jira connectivity
3. **Generate release notes** — `jira search --jql 'project = PSOD AND fixVersion = "Deployment YYMM.NN"'` — show the user what's in this release
4. **Cross-reference ticket coverage** — verify each fixVersion ticket has a corresponding commit or is covered by a bulk composer/core update; flag any gaps
5. **Report ticket states** — list unresolved tickets, do not block on them for staging
6. **Confirmation gate** — present the box above and wait for explicit yes
7. **Confirm ECR image exists** — `aws ecr describe-images --repository-name {project}-drupal --image-ids imageTag={TAG} --profile {AWS_PROFILE}`
8. **Merge stage PR** — merge the PR `open-stage-pr.yml` opened (titled "Deploy {TAG} to Stage") to trigger Job 2 via `push: stage`
9. **Monitor build:** Poll Jenkins for build number, stream console output until SUCCESS (30–60 min)
10. **Post-deploy verification:** Check ASG health, site HTTP response, watchdog tags
11. **Post-deploy Jira update:** Comment on tickets noting the deployment (optional, ask user)

---

## Release Process

### Step 1: Cut the Release Tag — **use `create-release.yml` (MANDATORY preferred path)**

> ⚠️ **Do NOT cut the tag manually with `git tag` if `create-release.yml` is available for the project.** A bare `git tag` push creates the tag and triggers Job 1 (ECR image build) correctly, but it does **not** create a GitHub Release. The GitHub Release is required for traceability — it documents the changelog, the Jira fixVersion scope, and what happens next. Skipping it means no release record exists until someone creates it retroactively.

**Preferred path — `create-release.yml` workflow_dispatch (all three projects as of 2026-09-21):**

1. Go to the project's GitHub repo → **Actions** → **`create-release.yml`**
2. Click **Run workflow** — inputs are optional; omit all three to auto-increment from the latest matching tag
3. The workflow: validates tag format, pushes the tag via `GH_DEPLOY_PAT` (required to trigger downstream `JenkinsTrigger.yml`), generates a changelog, and opens a prerelease GitHub Release
4. Confirm Job 1 (`{project}-drupal-tag-created`) started within ~30 seconds of the tag push

**Fallback — manual git tag (only when `create-release.yml` is unavailable or broken):**

```bash
git checkout develop && git pull
git tag YYYYMM.NN.NN   # zero-padded: 202609.01.01 not 202609.1.1
git push origin YYYYMM.NN.NN
```

If you used the fallback, **you must create the GitHub Release manually** before proceeding:

```bash
TAG_SHA=$(gh api repos/AHRQ/{repo}/git/refs/tags/{TAG} --jq '.object.sha')
gh release create {TAG} \
  --repo AHRQ/{repo} \
  --title "Release {TAG}" \
  --prerelease \
  --target "$TAG_SHA" \
  --notes "## Release \`{TAG}\`
**Jira fixVersion:** Deployment {YYMM.NN}
### Changelog
$(gh api repos/AHRQ/{repo}/compare/{PREV_TAG}...{TAG} --jq '.commits[] | "- \(.commit.message | split("\n")[0])"')
### What happens next
Merge the stage PR to trigger Job 2 (pso-drupal-site-deploy-stage)."
```

### Step 2: Tag-Created Job Builds and Pushes the Image **[confirmed]**

The `{project}-drupal-tag-created` Jenkins job fires on tag push, builds the Docker image, and pushes a single tag to ECR.

- ECR registry: `406380712964.dkr.ecr.us-east-1.amazonaws.com`
- Push function: `push_to_ecr()` in `drupal-deploy/ecr-functions.sh`
- ECR auth always uses `AWS_PROFILE=default` (AHRQGOV account) regardless of the project's deploy profile
- A green Job 1 is not proof the image landed — confirm in ECR

### Step 3: Merge the Release Branch into `stage` **[confirmed]**

Open a PR from `release/YYYYMM.NN.NN` into `stage` so it passes PR review and the Puppeteer gate. A direct push of the release branch is acceptable. Do **not** merge `develop` directly into `stage`.

### Step 4: Stage Deploy Job Runs the 5-Stage Pipeline **[confirmed]**

The `{project}-drupal-site-deploy-stage` Jenkins job orchestrates the full blue-green deployment. Trigger with Method 1 or 3 — the webhook path is broken.

---

## Automated Release Workflow — `create-release.yml` / `open-stage-pr.yml`

This is what `ADR-PIPELINE-003` / `AQD-9437` describes, and its status is now **[confirmed — both files read directly, 2026-09-21]** rather than unconfirmed. It lives in each **Drupal project's own repo**, not in `devops`: `.github/workflows/create-release.yml` and `.github/workflows/open-stage-pr.yml`, alongside the existing `JenkinsTrigger.yml` documented in Trigger Plumbing below.

### What `create-release.yml` does

A `workflow_dispatch` job (optional inputs: `year_month`, `sprint`, `build` — omit all three to auto-increment from the latest matching tag). It:

1. Checks out `develop`.
2. Computes and validates the `YYYYMM.NN.NN` tag (zero-padded, matching the format this skill requires everywhere else).
3. Pushes the tag using a **`GH_DEPLOY_PAT`** repo secret instead of the default `GITHUB_TOKEN`. This isn't a style choice — GitHub blocks `GITHUB_TOKEN` from triggering a downstream workflow's `create` event, so without the PAT, `JenkinsTrigger.yml`'s tag-created handler would silently never fire.
4. Generates a changelog from `git log` between the previous matching tag and `develop`.
5. Opens a **prerelease** GitHub Release (`gh release create --prerelease`) with that changelog and a "what happens next" block, and posts a workflow summary.

### What `open-stage-pr.yml` does

Fires on push to `release/**`. Extracts the tag from the branch name, then opens (or finds an existing) PR into `stage` titled `Deploy {TAG} to Stage`, with a pre-merge checklist ("Jenkins Job 1 completed", "image verified in ECR", "approved by required reviewer"), optional reviewers via the `STAGE_PR_REVIEWERS` repo variable, and a `stage-deploy` label.

### How it plugs into the existing pipeline — no `JenkinsTrigger.yml` changes needed

The tag `create-release.yml` pushes fires the **existing** `create: tags: '*'` handler in `JenkinsTrigger.yml` → Job 1 (`{project}-drupal-tag-created`) unchanged. Once a human merges the PR `open-stage-pr.yml` opened, that push to `stage` fires the **existing** `push: branches: [stage]` handler → Job 2 (`{project}-drupal-site-deploy-stage`) unchanged. AHRQGOV's and PSO's `JenkinsTrigger.yml` needed zero edits for this to work.

### Status per project, verified 2026-09-21

| Project | `create-release.yml` | `open-stage-pr.yml` | Notes |
|---|---|---|---|
| EHC | Present, `.github/workflows/` | Present, `.github/workflows/` | Read directly; in active use |
| AHRQGOV | **Added 2026-09-21**, uncommitted-to-origin | **Added 2026-09-21**, uncommitted-to-origin | Branch `feature/ado-create-release-workflow` off `origin/develop`, committed locally, **not pushed, no PR opened** |
| PSO | **Live — merged via PR #218** (2026-09-21) | **Live — merged via PR #218** (2026-09-21) | Both files present in `.github/workflows/` on `develop`. `GH_DEPLOY_PAT` confirmed working (tag `202609.01.01` pushed successfully). Prerequisite confirmed satisfied. |

The AHRQGOV/PSO copies are a verbatim port of EHC's files — diffed against the EHC originals, the only differences are the project-name substitutions (`ehc-drupal` → `ahrqgov-drupal`/`pso-drupal` in the release-notes text and ECR path, `PROJECT_NAME: ehc` → `ahrqgov`/`pso`).

**Unverified prerequisite:** this only works once a `GH_DEPLOY_PAT` repo secret (scope `contents: write`) exists in that repo's GitHub settings. EHC evidently has one. Whether AHRQGOV and PSO do was **not checked** — there is no `gh` CLI or GitHub API access from the device shell used for this pass. Confirm before merging or running these workflows on either project.

### What this does *not* give AHRQGOV/PSO

EHC's `JenkinsTrigger.yml` additionally listens for `release:` events (`created`, `edited`, `prereleased`, `published`, `released`, `unpublished`) and, on a `release` event, runs a JIRA-release-notes step (`.github/scripts/jira_release_notes.py`) that rewrites the GitHub Release body with JIRA-derived notes before separately deciding the Jenkins job type (skip a duplicate trigger for bot-authored prereleases, `deploy-stage` on a human-created prerelease, `deploy-production-blue` on `released`/`published`). AHRQGOV's `JenkinsTrigger.yml` only listens for `release: types: [published, released]` — no `prereleased`, so `create-release.yml`'s prerelease event doesn't even reach it — and has no JIRA step. PSO's doesn't listen for `release:` at all. **Porting the two workflow files gives AHRQGOV and PSO the tag-cut + auto-PR mechanics only, not EHC's JIRA-release-notes-on-release automation or its production-promotion-on-publish handling.** Replicating those would mean separately editing both projects' `JenkinsTrigger.yml`, which was not done here.

### Revised release sequence, once the prerequisites above are confirmed

1. Run `create-release.yml` (`workflow_dispatch`) instead of cutting the tag by hand — it validates the format and auto-increments for you.
2. Confirm the image landed in ECR (Job 1 still doesn't prove it with a green build alone).
3. `open-stage-pr.yml` auto-opens the `release/{TAG}` → `stage` PR — no manual PR needed.
4. Human reviews and merges.
5. Job 2 fires automatically off the merge; verify per Post-Deployment Verification.

Until AHRQGOV's branch is pushed, PR'd, and merged, AHRQGOV still uses the manual Step 1 fallback. PSO is fully automated as of 2026-09-21 — use `create-release.yml` for all PSO deploys.

---

## Tag Resolution Logic **[confirmed — read directly 2026-09-21]**

Source: `drupal-deploy/verify-release.sh`

> **Known bug:** Line 5 uses `[ -z "${GIT_TAG_NAME+x}" ]` which tests whether the variable is *set*, not whether it has a non-empty *value*. See Known Bugs #1.

1. If `GIT_TAG_NAME` is set (see bug above), use it as `TAG`.
2. Otherwise, fall back to `git tag | grep -E '^[0-9]{6}\.[0-9]{2}\.[0-9]{2}$' | sort -V | tail -1` — release-format tags only, version-sorted. This is the ADO-345 Issue #1 fix; it excludes the AMI bake pipeline's `.ami{hash}` compound tags.
3. Verify the tag is associated with a branch. If not, the deployment **fails hard** (ADO-320 fix — prevents stale/dangling tag redeploys that exhaust launch config suffix retries). A TAG containing `/` skips this check entirely.
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
| 4 | `4_live_prepromote.sh` | **Validation only.** ELB health gate (ADO-345) on the Blue target group; exits 1 if targets are unhealthy. 50 lines, no Ansible, no symlink work. |
| 5 | `5_live_promote.sh` | **The real cutover.** Calls `run_drupal_deploy promote` — the Python orchestrator generates live userdata, creates the live launch config, updates the live ASG, scales up, verifies health, scales down old, and creates the symlink. Then re-enables the watchdog (ADO-398). |

### Stage 4 vs Stage 5 — the "promote is a no-op" claim is wrong **[settled by direct read, 2026-09-21]**

Older documents (the Confluence guide, `.ai-memory/WHY-STAGE-WORKS-PRODUCTION-FAILS.md`, and earlier versions of this skill) state that stage 4 performs the real cutover via the Ansible tag `symlink_live`, and that stage 5 is a no-op because no task carries `promote_live`. That is wrong:

- `5_live_promote.sh` (73 lines) calls `run_drupal_deploy promote`. No Ansible, no playbook tags. Promotion happens here.
- `4_live_prepromote.sh` carries an explicit comment (lines 14–21): *"The promote-playbook.yml symlink creation has been moved to the Python promote step which now handles the complete promotion workflow including... Symlink creation."*
- The string `promote_live` does not exist anywhere in the repo. `symlink_live` exists only in `drupal-deploy/ansible/promote-playbook.yml`, which **no current stage script invokes** — it survives only in docs and analysis markdown.
- The move happened in commit `ba0c384` (2026-03-12, "restore Python promote call to fix live mount regression"). The claim has been stale since then.

If anything the inverse holds: on `origin/main`, stage 4 loads creds and prints "Prepromote validation complete" — close to a no-op. The ADO-345 health gate that gives it substance is a 27-line addition present only on branch `ADO-345-shell-integration`, **not merged to main** as of 2026-09-21. `5_live_promote.sh` is byte-identical on both.

When debugging a stuck promotion, read the **stage 5 container logs**, not stage 4's Ansible output.

### The `run_drupal_deploy` Function **[confirmed]**

Source: `drupal-deploy/common.sh:647`

1. Authenticates with ECR (`authenticate_ecr`)
2. Pulls the `drupal-deploy:latest` image from ECR
3. Detects `RELEASE_TYPE` (live deploy vs AMI refresh)
4. Runs a Docker container in detached mode with:
   - AWS credentials mounted (`.aws/config`, `.aws/credentials`)
   - Project `settings.yml` mounted
   - SSH key mounted (only when `SSM_ENABLED != true`)
   - Environment variables: `PROJECT`, `ENVIRONMENT`, `VERSION`, `STEP`, `RELEASE_TYPE`, `SSM_ENABLED`, `PROJECT_ASG`, `AMI_ID`
5. Streams container logs to Jenkins console in real-time
6. Waits with a 15-minute timeout (`timeout 900 docker wait`), validating that the wait output is an integer
7. Returns the **container's actual exit code** (ADO-320 fix — the previous implementation redirected `docker wait` to /dev/null and silently masked every container failure, including build #878)

---

## Per-Project Configuration

### What Jenkins Actually Executes

> **⚠️ Drift warning:** Jenkins executes the builder script embedded in each job's `config.xml`, **not** the `jenkins/*.sh` files in this repo, which are mirrors that have diverged. The live exports live at **`jenkins-configs/jobs/`** in the repo root. Note there are three `jenkins-configs` trees — `./jenkins-configs`, `./drupal-deploy/jenkins-configs`, and `./drupal-deploy/jenkins-config-sync/jenkins-configs` — and only the root one holds current `config.xml` files; the jenkins-config-sync copy holds only `lastBuild.json`. `jenkins-config-sync/auto-sync.sh` re-exports nightly.

Each job's embedded script sources `verify-release.sh` at these lines (verified 2026-09-21; they shift on every nightly sync):

| Project | config.xml | Lines | `source verify-release.sh` at |
|---------|-----------|-------|------------------------------|
| AHRQGOV | `jenkins-configs/jobs/AHRQGOV/ahrqgov-drupal-site-deploy-stage/config.xml` | 442 | 249 |
| EHC | `jenkins-configs/jobs/EHC/ehc-drupal-site-deploy-stage/config.xml` | 201 | 153 |
| PSO | `jenkins-configs/jobs/PSO-Drupal/pso-drupal-site-deploy-stage/config.xml` | 461 | 253 |

### Job, ASG, and Webhook Reference

| | AHRQGOV | EHC | PSO |
|---|---|---|---|
| Job 1 | `ahrqgov-drupal-tag-created` | `ehc-drupal-tag-created` | `pso-drupal-tag-created` |
| Job 2 | `ahrqgov-drupal-site-deploy-stage` | `ehc-drupal-site-deploy-stage` | `pso-drupal-site-deploy-stage` |
| Jenkins folder | `AHRQGOV` | `EHC` | `PSO-Drupal` |
| AWS profile | `default` | `EHCDeploy` | `PSODeploy` |
| Live ASG (`PROJECT_ASG`) | `AHRQ-Stage-ASG` | `EHC-Stage-ASG` | `PSO-Stage-ASG` |
| Blue ASG | `AHRQ-Stage-Blue-ASG` | `EHC-Stage-Blue-ASG` | `PSO-Stage-Blue-ASG` |
| Webhook regex | `refs/heads/stage\|refs/tags/\d{6}\.\d+\.\d+` | `refs/heads/stage` only | `refs/heads/stage` only |
| Webhook token | `ahrqgov-drupal-site-deploy-stage` | `ehc-drupal-site-deploy-stage` | `pso-drupal-site-deploy-stage` |
| Extra build param | none | `DOCKER_IMAGE_TAG` | none |

`PROJECT_ASG` is always the **live** ASG. `verify-release.sh` uses it only for the already-deployed idempotency check, never as the blue-green target.

### Credentials — identical on all three Job 2s **[confirmed from config.xml, 2026-09-21]**

| Credential ID | Purpose |
|---|---|
| `acheslowgithubtoken` | GitHub checkout (appears twice — one per SCM) |
| `ahrqgovjenkinsfile` | Jenkinsfile / pipeline definition |
| `ahrqgovjenkinsdeployuser` | SSH agent for Ansible, via `SSHAgentBuildWrapper` with `ignoreMissing=false` |

EHC and PSO do **not** have project-specific equivalents — they share AHRQGOV's credentials. None of the old Confluence guide's IDs (`github-app-credential`, `internal-repo-ssh`, `ansible-private-key`, `ec2-ssh-agent-key`) exist on any of these jobs. There is no separate internal-repo checkout for `ecr-functions.sh`; it lives in the same `devops` checkout.

### Settings Files

- `drupal-deploy/ahrqgov/settings.yml` — AHRQ stage/prod config (EFS mounts, RDS, security groups, AMI, instance type)
- `drupal-deploy/ehc/settings.yml` — EHC stage/prod config (includes PEERCOMMENTS_BUCKET env vars, uses SSM Parameter Store for MySQL creds)
- `drupal-deploy/pso/settings.yml` — PSO stage/prod config

Both stage 4 and stage 5 extract `blue_autoscaling_group_name` from these with an inline awk block. A missing or renamed key degrades to a skipped health check (stage 4) or a skipped watchdog restore (stage 5) — in both cases with only a WARNING, no failure.

### Per-Project Differences

| Feature | AHRQGOV | EHC | PSO |
|---------|---------|-----|-----|
| Sources `common.sh` in entry script | No (older inline style) | Yes | No (older inline style) |
| Nessus agent re-link | No | No | Yes — unlinks and re-links to `PSO-Stage-Autoscaled` group |
| Scale-to-zero wakeup in entry script | No (handled in `1_blue_predeploy.sh`) | No (handled in `1_blue_predeploy.sh`) | Yes — explicit `wakeup.sh` call for Live ASG before deploy |
| S3 session bucket | Not set | `ehc-ssm-sessions-bucket` | `pso-staging-bucket` |
| MySQL credential source | Hardcoded in settings.yml | SSM Parameter Store (`/ehc/stage/mysql_*`) | Hardcoded in settings.yml |

> Note: as of commit `ac5425d` (2026-09-18) the `jenkins/*.sh` mirrors were consolidated so all three follow EHC's pattern. That consolidation applies to the mirrors, not necessarily to the config.xml scripts Jenkins runs — check the config.xml before assuming the entry scripts now match.

---

## Operational Safety Features

### SSM-First Mode (ADO-317) **[confirmed]**

`1_blue_predeploy.sh` exports `SSM_ENABLED=true`. Ansible connects to instances via AWS Systems Manager by default. SSH key is mounted as fallback only (non-fatal if missing when SSM is enabled).

### ASG Wakeup (ADO-318) **[confirmed]**

`1_blue_predeploy.sh` calls `wake_up_asg "$PROJECT_ASG" 480` — wakes up idle ASGs scaled to zero, with an 8-minute timeout. Deployment aborts if wakeup fails.

### Pre-Promote ELB Health Gate (ADO-345) **[confirmed — branch only]**

`4_live_prepromote.sh` calls `validate_elb_health "$BLUE_ASG_NAME" "pre-promote"`. If blue target group instances are unhealthy, promotion is blocked with:
```
ERROR: Pre-promote health check failed. Aborting promotion.
ACTION: Investigate why Blue TG targets are unhealthy and fix manually before retrying.
```

**This gate exists only on branch `ADO-345-shell-integration` and has not merged to `origin/main`.** On main, stage 4 performs no health check at all. A related fix adds a PRE-GATE-0 check that scales the LIVE ASG to 1 and waits for ALB health, because `validate_elb_health` silently passes when LIVE is at zero in a scale-to-zero environment.

### Scale-to-Zero Watchdog Protection (ADO-398) **[confirmed]**

The idle watchdog Lambda runs every 5 minutes and scales idle Blue ASGs to zero. During deployment the Blue ASG receives no production traffic and appears "idle" to the watchdog, which would kill the instance mid-deployment.

- **Stage 1:** Disables watchdog by setting `scale-to-zero:enabled=false` tag on Blue ASG
- **Stage 5:** Re-enables it by setting `scale-to-zero:enabled=true` — **only on successful promotion**
- **Error trap:** `restore_watchdog()` in Stage 1 covers **Stage 1 failures only**. It does not fire for failures in Stages 2–5. Any failure after Stage 1 leaves the watchdog disabled — run the Failure Recovery Checklist.

### Container Exit Code Propagation (ADO-320) **[confirmed]**

`run_drupal_deploy()` captures the container's actual exit code via `docker wait` stdout. The previous implementation redirected this to `/dev/null` and only checked `$?` of the wait command itself, silently masking all container failures (including "MAXIMUM ATTEMPTS used for creating launch config exceeded" in build #878).

---

## ECR Cross-Account Authentication **[confirmed]**

The ECR registry lives in the AHRQGOV account (`406380712964`). All three projects authenticate to ECR using `AWS_PROFILE=default` regardless of the deployment profile:

- `ecr-functions.sh` line 56: `AWS_PROFILE=default aws ecr get-login-password`
- `common.sh` `authenticate_ecr()`: Uses `ECR_PROFILE="${ECR_PROFILE:-default}"`

EHC (`EHCDeploy`) and PSO (`PSODeploy`) deploy profiles do **not** need ECR permissions.

---

## Trigger Plumbing

There is **no `JenkinsTrigger.yml`** in the `devops` repo (`github.com/AHRQ/web-services-devops`). The GitHub-side workflow is named **`JenkinsTrigger.yml`** — not `trigger-jenkins-build.yml` as earlier notes guessed — and lives in each Drupal project's own repo (`ahrqgov-drupal`, `ehc-drupal`, `pso-drupal`) under `.github/workflows/`. **[confirmed — all three read directly, 2026-09-21]**

It triggers on `workflow_dispatch`, pushes to `develop`/`stage`/`production-live`/`production-blue`, tag `create` events, and (EHC only) `release` events. It assumes an AWS role via OIDC (`AWS_ASSUME_ROLE` secret) and invokes a Lambda directly with `aws lambda invoke` (`LAMBDA_FUNCTION_ARN` secret) — no API Gateway, confirming the earlier design note. The Lambda payload carries a `job_type` the workflow derives from the event (`build`, `tag-created`, `deploy-stage`, `deploy-production-blue`, `deploy-production-live`), plus the ref; presumably the Lambda then calls the Jenkins webhook token for that job (see the Webhook token row in Per-Project Configuration).

EHC's copy differs from AHRQGOV's and PSO's: it additionally handles `release:` events end to end, including a JIRA-release-notes-generation step. See the Automated Release Workflow section above for exactly what that means and what AHRQGOV/PSO do and don't get from it.

`ADR-PIPELINE-003`'s two-workflow design (`create-release.yml`, `open-stage-pr.yml`, tracked as `AQD-9437`) has shipped — see Automated Release Workflow above for confirmed status per project.

---

## Key File Reference

| File | Purpose |
|------|---------|
| `jenkins-configs/jobs/{FOLDER}/{job}/config.xml` | **What Jenkins actually runs** — embedded builder script, parameters, webhook config, credentials |
| `jenkins/{project}-drupal-site-deploy-stage.sh` | Repo **mirror** of the entry script — not executed by Jenkins; may have drifted |
| `drupal-deploy/verify-release.sh` | Tag resolution, branch association check, already-deployed detection |
| `drupal-deploy/common.sh` | Shared functions: `load_aws_profile`, `authenticate_ecr`, `run_drupal_deploy` (line 647), `wake_up_asg`, `validate_elb_health`, `setup_ssh_key` |
| `drupal-deploy/ecr-functions.sh` | `push_to_ecr()` and `pull_from_ecr()` with retry logic |
| `drupal-deploy/1_blue_predeploy.sh` | Stage 1: AWS creds, ASG wakeup, watchdog disable, Ansible predeploy |
| `drupal-deploy/2_blue_deploy.sh` | Stage 2: `run_drupal_deploy deploy` |
| `drupal-deploy/3_blue_site_restore.sh` | Stage 3: Database/content restoration |
| `drupal-deploy/4_live_prepromote.sh` | Stage 4: ELB health gate only |
| `drupal-deploy/5_live_promote.sh` | Stage 5: `run_drupal_deploy promote`, watchdog re-enable |
| `drupal-deploy/ansible/promote-playbook.yml` | **Dormant** — holds the `symlink_live` tasks; no current stage script invokes it |
| `drupal-deploy/{project}/settings.yml` | Per-project YAML: ASG names, EFS mounts, RDS, security groups, AMI, ports |
| `drupal-deploy/export_aws_profile.sh` | Extracts AWS credentials from Jenkins credential store |

---

## Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| Green build, nothing deployed, "Empty version; Will not deploy" | Webhook-triggered build — `GIT_TAG_NAME` set-but-empty (Known Bugs #1). Or no `InService` instance on the live ASG, or version already deployed. | Re-run via Method 1 with `GIT_TAG_NAME` passed explicitly. Never trust a green Job 2 without grepping the log for this string. |
| Webhook never fires on a tag push (EHC/PSO) | Their regex matches `refs/heads/stage` only — no tag alternation | Expected. Trigger via Method 1. |
| "Tag is not associated with any branch" | Dangling/stale tag (ADO-320 gate) | Cut a new incrementing version tag. Do not retry the same one. |
| "version is already deployed" | Live ASG instance already has this version tag | Cut a new deploy number (e.g. `.02`) |
| Auto-detect picks a tag you didn't expect / `docker pull` 404 on a `.ami{hash}` tag | `sort -g` fix merged/pushed for AHRQGOV and PSO (PR #82, `a25916e`) but not confirmed live — see Known Bugs #3 | Confirm the job's config.xml against live Jenkins; run `jenkins-config-sync/import-jenkins-jobs.sh` or fix by hand in the UI if it's still `sort -g` there |
| Tag you cut is never selected by auto-detect | Tag isn't zero-padded — `202609.3.1` fails the `[0-9]{2}` filter | Re-cut as `202609.03.01` |
| Promotion failed, no error guidance printed, watchdog left disabled | Stage 5's `set -e` bug (Known Bugs #2) | Read the stage 5 container logs; restore the watchdog manually |
| Deploy proceeded with no health check and no explanation | `blue_autoscaling_group_name` missing from settings.yml — stage 4 warns and skips the gate | Check the awk extraction against that project's settings.yml |
| "Failed to wake up ASG" | Live ASG didn't reach InService within 8 min | Check ASG activity, instance health, launch template |
| "Pre-promote health check failed" | Blue TG targets are unhealthy after deploy | SSH/SSM into blue instance, check Docker container, Drupal health |
| Container timeout (15 min) | Python orchestrator hung | Check container logs, ASG scaling events, launch config creation |
| "MAXIMUM ATTEMPTS used for creating launch config exceeded" | Same tag deployed repeatedly without incrementing | Cut new tag; clean up stale launch configs |
| Watchdog kills blue instance mid-deploy | ADO-398 tag not set or Lambda fired between tag write and check | Verify `scale-to-zero:enabled=false` on Blue ASG during deploy |
| `TargetNotConnected` on site-restore Ansible task | A concurrent `aws ssm send-command` (progress monitor or diagnostic call) is competing with the Ansible `aws_ssm` `StartSession` | **Never call `send-command` on an instance while Ansible `aws_ssm` holds an active shell task on it.** Replace any SSM-based progress monitor with a local elapsed-time counter (`date +%s` arithmetic, no remote calls). |
| Site-restore Ansible task: `ok=3 changed=1 failed=1` then `TargetNotConnected` | Same as above — SSM session interference | See row above |
| `Build step 'Execute shell' marked build as failure` but PLAY RECAP shows `failed=0` and `EXIT CODE: 0` | `wait $MONITOR_PID 2>/dev/null` returned exit 143 (SIGTERM from `kill`) and `set -euo pipefail` aborted the script before exit-code check | Fix: `wait $MONITOR_PID 2>/dev/null \|\| true` — always suppress `wait` on a killed background process |
| `--limit` on Ansible `aws_ssm` playbook → "no hosts targeted" | The inventory host is named `instance_id` (literal), not the EC2 ID. `--limit i-0abc123` matches nothing | Use `ansible_aws_ssm_instance_id` in `extra_vars` to pin the SSM session to the correct instance without changing `--limit` |
| EC2 confirm poll loops all 12 attempts (180s) then WARN and proceeds | `describe-instances` filter uses `PROJECT_ASG` (`EHC-Stage-ASG`) instead of the BLUE-specific ASG name (`EHC-Stage-Blue-ASG`) | The confirm poll should filter only on `instance-state-name=running` for the specific instance ID — no ASG tag filter needed once instance ID is known |
| `NO_LOG_YET` when tailing `/tmp/site-restore.log` via `send-command` | The log file is inside the Docker container, not on the EC2 host | Use `docker exec {project}-drupal-web bash -c "tail -20 /tmp/site-restore.log"` inside the `send-command` parameters |
| `async: 3600 / poll: 60` Ansible task with `aws_ssm` hangs or disconnects after ~60s | `aws_ssm` connection plugin does not support async polling — each poll opens a new SSM session, the original session terminates, remote process is orphaned | Replace with synchronous `shell` task + `timeout: 3600` + `> /tmp/file.log 2>&1` stdout redirect to prevent buffer overflow |
| CKEditor broken on stage only, `RangeError: Maximum call stack size exceeded` in `ckeditor5-dll.js` | Suspected stale aggregated JS/CSS after deploy | Regenerate aggregated JS and CSS, clear cache. **[unconfirmed — reported on stage 2026-09-18 after the EHC deploy; root cause never confirmed, no fix recorded]** |

---

## Stage 3 Site-Restore — Implementation Notes (ADO-345, confirmed 2026-09-18)

Source: `drupal-deploy/3_blue_site_restore.sh` + `ansible/deploy-site-restore-playbook.yml`

### What Stage 3 Does

1. Resolves the Blue ASG instance ID via `wait_for_instance_in_asg()` (snapshot-at-start pattern)
2. Waits for EC2 `running` state
3. Starts an **elapsed-time heartbeat monitor** (background subshell, `date +%s` only — no SSM calls)
4. Runs Ansible site-restore playbook via `run_ansible()` with `ansible_aws_ssm_instance_id` override
5. Kills monitor, suppresses `wait` exit code with `|| true`
6. Propagates Ansible exit code

### Playbook Task (synchronous)

```yaml
- name: Site Restore with Binary Logging Workaround
  shell: |
    docker exec {project}-drupal-web drush sql:query "SET SESSION sql_log_bin = 0;" || true
    docker exec --env AWS_PROFILE=default {project}-drupal-web composer site-restore > /tmp/site-restore.log 2>&1
    rc=$?
    docker exec {project}-drupal-web drush sql:query "SET SESSION sql_log_bin = 1;" || true
    tail -50 /tmp/site-restore.log
    exit $rc
  timeout: 3600
```

> **Note:** `/tmp/site-restore.log` is inside the Docker container. From the EC2 host, read it with `docker exec {project}-drupal-web bash -c "tail -50 /tmp/site-restore.log"`.

### Verified Baseline (Build #436)

- Site-restore PLAY RECAP: `ok=5 changed=2 unreachable=0 failed=0`
- Runtime: ~11 minutes (S3 sync on 7.6G files + `drush config:import`)
- `drush config:import` runs at ~45% CPU inside the container while `composer site-restore` is the parent process
- Config imports 6 items on a typical EHC stage restore (webform + workflows + readonlymode)
- Full pipeline runtime: **31.9 minutes**

### AWS Profile Notes

| Context | Profile |
|---------|---------|
| Jenkins agent (EHC) | `EHCDeploy` (injected by Jenkins credential binding) |
| Local `aws` CLI (EHC) | `975242026693_ct-ehc-dev-role` (STS token, 1hr expiry) |
| ECR authentication | Always `default` (AHRQGOV account) |
| SSM `send-command` to EHC instances | `975242026693_ct-ehc-dev-role` locally; `EHCDeploy` on Jenkins |

---

## Open Items

- Both the `${GIT_TAG_NAME+x}` → `${GIT_TAG_NAME:-}` fix and the AHRQGOV/PSO `sort -V` fix **merged and pushed** to `ADO-345-shell-integration` via PR #82 (commit `a25916e`), 2026-09-21 — no longer local-only. Still open: whether `ADO-345-shell-integration` is the branch live Jenkins actually builds from (see below), and whether the config.xml side of the sort fix needs `jenkins-config-sync/import-jenkins-jobs.sh` / a manual Jenkins UI edit to take effect, per the merge commit's own caveat.
- The stage 5 `set -e` unreachable-failure-branch bug
- `set -euo >/dev/null` in `verify-release.sh:3` — `pipefail` is not actually enabled
- Whether `ADO-345-shell-integration` has merged to `main`, and which branch of this repo Jenkins checks out for a deploy. During the Sep 18 builds it was checking out `ADO-345-shell-integration`, so the health gates were live for those builds but may not be for others.
- Whether the malformed `release/2202608.01.03` branch still exists on the remote
- Jira project keys and fixVersion naming (never verified against Jira)
- Whether a `GH_DEPLOY_PAT` repo secret (scope `contents: write`) exists on `ahrqgov-drupal` and `pso-drupal` — required before their new `create-release.yml`/`open-stage-pr.yml` (added 2026-09-21, unpushed) can run
- Whether AHRQGOV/PSO want EHC's JIRA-release-notes-on-release and production-promotion-on-publish `JenkinsTrigger.yml` handling replicated too, or just the tag-cut + auto-PR mechanics that were ported today
- Root cause of the 2026-09-18 CKEditor-on-stage issue
