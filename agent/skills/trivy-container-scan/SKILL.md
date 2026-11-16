---
name: trivy-container-scan
description: Diagnose and fix Trivy container scan failures in Drupal GitHub Actions build pipelines. Use when the Trivy gate scan step fails, when a new CVE or secret finding is blocking the build, when .trivyignore suppressions are not working, or when Trivy-related workflow configuration needs fixing. Covers image-ref misconfiguration, trivyignores path issues, skip-files for secret suppression, .trivyignore syntax rules for CVEs vs secrets, and known false positives across site-a-drupal, site-b-drupal, and site-c-drupal.
---

# Trivy Container Scan — Drupal Pipelines

## Overview

All three Drupal projects (site-a-drupal, site-b-drupal, site-c-drupal) run Trivy in their GitHub Actions build workflows. Each has two Trivy steps:

1. **Gate scan** — exits 1 on fixable CRITICAL/HIGH findings; blocks ECR push and deploy
2. **JSON artifact scan** — always runs (`if: always()`), uploads full report as artifact for review

Trivy binary version in use: **v0.70.0** (via `aquasecurity/trivy-action` v0.36.0).

---

## Critical Configuration Rules

### Rule 1 — `image-ref` MUST use the full ECR URI

```yaml
# CORRECT
image-ref: '${{ env.ECR_REGISTRY }}/${{ env.REPOSITORY }}:${{ steps.build.outputs.sha_tag }}'

# WRONG — short name is never tagged in the runner's Docker daemon
image-ref: '${{ env.REPOSITORY }}:${{ steps.build.outputs.sha_tag }}'
```

**Why:** The `Build Docker Image` step tags with `BASE=$ECR_REGISTRY/$REPOSITORY`. The short name (e.g. `site-c-drupal:sha-...`) is never created locally. Trivy exits with:
```
FATAL: unable to find the specified image "site-c-drupal:sha-XXXXXXX" in ["docker" "containerd" "podman" "remote"]
```

### Rule 2 — `trivyignores` path must include the checkout subdirectory prefix

```yaml
# CORRECT — repo checked out into <REPOSITORY>-repo/ subdirectory
trivyignores: '${{ env.REPOSITORY }}-repo/.trivyignore'

# WRONG — Trivy runs from workspace root, not the checkout directory
trivyignores: '.trivyignore'
```

**Why:** `actions/checkout` checks the repo out into a named subdirectory (e.g. `site-c-drupal-repo/`). The `.trivyignore` path must include that prefix or Trivy logs `ERROR: cannot find ignorefile`.

### Rule 3 — `.trivyignore` secret suppression is BROKEN in Trivy v0.70.0

**Neither of these work for secret findings:**
```
# DOES NOT WORK — bare file path (only valid for CVE IDs)
/etc/ssl/private/ssl-cert-snakeoil.key

# DOES NOT WORK — ruleID:path format (read but not honoured in v0.70.0)
private-key:/etc/ssl/private/ssl-cert-snakeoil.key
```

**Use `skip-files` in the workflow action instead:**
```yaml
skip-files: 'root/.npm/_cacache,usr/src/php,etc/ssl/private/ssl-cert-snakeoil.key'
```

> **Note:** `skip-files` paths have **no leading slash** — Trivy strips the root `/` from image filesystem paths.

---

## Diagnosing a Trivy Build Failure

### Step 1 — Get the error from failed logs
```bash
gh run view <RUN_ID> --log-failed | grep -E "image-ref|trivyignore|ERROR|FATAL|Total:|HIGH:|CRITICAL:|exit code|AsymmetricPrivateKey" | head -20
```

### Step 2 — Identify error type

| Error message | Root cause | Fix |
|---------------|-----------|-----|
| `unable to find the specified image "<repo>:sha-..."` | `image-ref` uses short name | Change to `${{ env.ECR_REGISTRY }}/${{ env.REPOSITORY }}:...` |
| `ERROR: cannot find ignorefile '.trivyignore'` | Wrong `trivyignores` path | Change to `'${{ env.REPOSITORY }}-repo/.trivyignore'` |
| `Total: N (HIGH: N, CRITICAL: N)` + exit 1 | Real or false-positive finding | Download JSON artifact, analyze, suppress if FP |
| Finding persists after `.trivyignore` entry | `.trivyignore` secret suppression broken in v0.70.0 | Add to `skip-files` in workflow |

### Step 3 — Download and analyze the JSON artifact
```bash
# Download artifact (must run from repo directory for gh CLI to find the repo)
gh run download <RUN_ID> --name trivy-build-sha-<SHA> --dir /tmp/trivy-artifact/

# Inspect secret findings
jq '[.Results[]? | select(.Secrets != null) | {Target, Secrets: [.Secrets[] | {RuleID, Category, Severity, Title}]}]' \
  /tmp/trivy-artifact/trivy-build-results.json

# Inspect CVE findings
jq '[.Results[]? | select(.Vulnerabilities != null) | {Target, Vulns: [.Vulnerabilities[] | {VulnerabilityID, Severity, PkgName, InstalledVersion, FixedVersion}]}]' \
  /tmp/trivy-artifact/trivy-build-results.json
```

---

## Suppressing False Positives

### For secret findings — use `skip-files` (NOT `.trivyignore`)

Add the file to `skip-files` on BOTH Trivy steps in the build workflow:

```yaml
# Path has no leading slash
skip-files: 'root/.npm/_cacache,usr/src/php,etc/ssl/private/ssl-cert-snakeoil.key'
```

### For unfixable CVE findings — use `.trivyignore`

CVE suppressions in `.trivyignore` work correctly. Use bare CVE IDs with documented justification:

```
# CVE-YYYY-NNNNN
# Package: <name>, installed: <version>, no fix available
# Justification: upstream has not released a fix; unfixable in current image
# Approved: <TICKET-ID>, <date>
CVE-YYYY-NNNNN
```

### For fixable CVE findings — update the package

If a CVE has a `FixedVersion` in the JSON artifact, update the package in the `Dockerfile` (e.g. `apt-get install <pkg>=<fixed-version>`) rather than suppressing it.

---

## .trivyignore Format Reference (Trivy v0.70.0)

| Entry type | Format | Works? |
|-----------|--------|--------|
| CVE suppression | `CVE-YYYY-NNNNN` (bare ID) | ✅ Yes |
| Secret — bare file path | `/etc/ssl/private/snakeoil.key` | ❌ Silently ignored |
| Secret — ruleID:path | `private-key:/etc/ssl/private/snakeoil.key` | ❌ Read but not honoured |
| Secret suppression | `skip-files` in workflow | ✅ Yes |

---

## Known False Positives

| File | Rule | Project | Justification |
|------|------|---------|---------------|
| `etc/ssl/private/ssl-cert-snakeoil.key` | `private-key` (AsymmetricPrivateKey, HIGH) | site-c-drupal (and any Debian Apache image) | Debian `ssl-cert` package auto-generated self-signed placeholder cert. "Snakeoil" = Debian's term for "not for production use." Dependency of `apache2`/`libapache2-mod-php`. No real credentials. Suppress via `skip-files`. |

---

## JenkinsTrigger.yml — `develop` must NOT be in push branches

For repos where a GitHub Actions build workflow owns the `develop` pipeline end-to-end, `JenkinsTrigger.yml` must NOT include `develop` in push branches. Having it in both causes duplicate parallel pipelines and ECR tag race conditions.

```yaml
# CORRECT — GitHub Actions build workflow owns develop
push:
  branches:
    # develop intentionally absent — <repo>-build.yml owns develop builds
    - stage
    - production-live
    - production-blue

# WRONG — causes parallel pipeline race with <repo>-build.yml
push:
  branches:
    - develop   # <-- remove this
    - stage
    - production-live
    - production-blue
```

---

## Merge Queue Clobber Pattern

The GitHub merge queue squashes PRs. When multiple in-flight PRs touch the same workflow file, a later PR can revert an earlier fix. This is a recurring issue on all three repos.

**After merging any workflow fix, always verify the target branch HEAD:**
```bash
git fetch origin <branch>
git show origin/<branch>:.github/workflows/<repo>-build.yml | grep "image-ref:"
git show origin/<branch>:.github/workflows/JenkinsTrigger.yml | grep -A8 "push:"
```

If a fix was clobbered, create a fresh branch from current HEAD and re-apply.

---

## Verified Working Configuration (confirmed 2026-11-02, Trivy v0.70.0)

```yaml
# Both Trivy steps in <repo>-build.yml
image-ref: '${{ env.ECR_REGISTRY }}/${{ env.REPOSITORY }}:${{ steps.build.outputs.sha_tag }}'
trivyignores: '${{ env.REPOSITORY }}-repo/.trivyignore'
skip-files: 'root/.npm/_cacache,usr/src/php,etc/ssl/private/ssl-cert-snakeoil.key'
```

```yaml
# JenkinsTrigger.yml push section
push:
  branches:
    - stage
    - production-live
    - production-blue
```
