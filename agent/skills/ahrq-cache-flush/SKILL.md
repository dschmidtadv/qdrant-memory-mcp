---
name: ahrq-cache-flush
description: Clear Drupal cache for AHRQ, EHC, and PSO production sites via SSM
---

# AHRQ Cache Flush Skill

## Overview

Clear Drupal cache tags (per-node surgical clearing) or full cache rebuild across AHRQ, EHC, and PSO production environments. Executes `drush cache:tag` commands inside Docker containers via AWS SSM.

## Dependency: SSM Connectivity

> **This skill does NOT handle SSH, SSM connectivity, or instance discovery.**
> It delegates ALL of that to the [`aws-ssm-connection`](../aws-ssm-connection/SKILL.md) skill.
>
> **Before executing any cache flush recipe:**
> 1. Load `aws-ssm-connection` SKILL.md
> 2. Follow its **Pre-Flight Check** (credential selection → STS verify → SSM connectivity test)
> 3. Use the connection method it determines (Direct SSM primary, Bastion fallback)
> 4. Use its **Instance Discovery** section to find current instance IDs
>
> The `aws-ssm-connection` skill owns the Environment Registry (instance IDs, profiles, container names, bastion config). Do NOT duplicate that data here.

## Environment Quick Reference

These are cache-flush-specific mappings only. For instance IDs, profiles, and connection details, see [`aws-ssm-connection`](../aws-ssm-connection/SKILL.md).

### ASG Tags (for dynamic instance discovery)

| Project | Prod ASG Tag | Stage ASG Tag | Container |
|---------|-------------|---------------|-----------|
| AHRQ | `AHRQ-Prod-ASG` | `AHRQ-Stage-ASG` | `ahrqgov-drupal-web` |
| EHC | `EHC-Prod-ASG` | `EHC-Stage-ASG` | `ehc-drupal-web` |
| PSO | `PSO-Prod-ASG` | `PSO-Stage-ASG` | `pso-drupal-web` |

Each environment also has a **Blue ASG** (e.g., `AHRQ-Prod-Blue-ASG`) for pre-promotion. Clear cache on the correct ASG based on deployment state.

### CloudFront Distributions

| Distribution ID | Domain | Local Profile |
|----------------|--------|---------------|
| `E2WCR860QC4KOD` | `www.ahrq.gov` (Production) | `406380712964_ct-ahrqgov-dev-role` |
| `E2T52PX9S8Q6R1` | `ahrq-stage.ahrq.gov` (Staging) | `406380712964_ct-ahrqgov-dev-role` |
| `E387AR7CXV2M6T` | `archive.ahrq.gov` (Archive) | `406380712964_ct-ahrqgov-dev-role` |

---

## Step 0: Establish SSM Connectivity & Discover Instances

**Delegate to [`aws-ssm-connection`](../aws-ssm-connection/SKILL.md):**

1. Run Pre-Flight Check (Steps 0–3) to determine connection method and verify credentials
2. Discover instance IDs using `ssm describe-instance-information` or `ec2 describe-instances` with ASG tag filter:

```bash
# Example: discover AHRQ Prod instances (use profile from aws-ssm-connection)
aws ec2 describe-instances \
  --profile <PROFILE> --region us-east-1 \
  --filters "Name=tag:aws:autoscaling:groupName,Values=AHRQ-Prod-ASG" "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].InstanceId" --output text
```

> **Key learning:** Use `ec2 describe-instances` with tag filter, NOT `autoscaling describe-auto-scaling-groups`. Instances are tagged with `aws:autoscaling:groupName` but may be detached from the ASG (ASG API shows 0 instances).

---

## Recipes

All recipes use the **SendCommand** pattern from `aws-ssm-connection` (Method 1, Pattern A). Replace `<PROFILE>`, `<INSTANCE_IDS>`, and `<CONTAINER>` with values discovered in Step 0.

### 1. Clear Cache for Specific Node (Surgical)

```bash
# Send cache tag invalidation
CMD_ID=$(aws ssm send-command \
  --profile <PROFILE> --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids <INSTANCE_ID_1> <INSTANCE_ID_2> \
  --parameters 'commands=["sudo docker exec <CONTAINER> drush cache:tag node:<NID>"]' \
  --comment "Cache flush node:<NID>" \
  --query 'Command.CommandId' --output text)

# Wait then verify
sleep 5
aws ssm get-command-invocation \
  --profile <PROFILE> --region us-east-1 \
  --command-id "$CMD_ID" --instance-id "<INSTANCE_ID_1>" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
```

Expected success output:
```
Success	[success] Invalidated tag(s): node:NID.
```

### 2. Clear Multiple Nodes in One Command

```bash
aws ssm send-command \
  --profile <PROFILE> --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids <INSTANCE_ID_1> <INSTANCE_ID_2> \
  --parameters 'commands=["sudo docker exec <CONTAINER> drush cache:tag node:111","sudo docker exec <CONTAINER> drush cache:tag node:222"]' \
  --query 'Command.CommandId' --output text
```

### 3. Full Cache Rebuild (Nuclear Option)

Clears ALL cache bins (Redis + database). Use when surgical clearing doesn't work or asset aggregation is broken.

```bash
aws ssm send-command \
  --profile <PROFILE> --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids <INSTANCE_ID_1> <INSTANCE_ID_2> \
  --parameters 'commands=["sudo docker exec <CONTAINER> drush cr"]' \
  --comment "Full cache rebuild" \
  --query 'Command.CommandId' --output text
```

### 4. Verify Container Name

If unsure of the container name, verify first (see [`aws-ssm-connection`](../aws-ssm-connection/SKILL.md) for `docker ps` examples):

```bash
aws ssm send-command \
  --profile <PROFILE> --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids <INSTANCE_ID> \
  --parameters 'commands=["sudo docker ps --format \"table {{.Names}}\t{{.Image}}\t{{.Status}}\""]' \
  --query 'Command.CommandId' --output text
```

---

## CloudFront Invalidation (Public URLs Only)

Admin URLs (`admin.ahrq.gov`, `effectivehealthcare-admin.ahrq.gov`) bypass CloudFront — no CDN invalidation needed.

Public-facing URLs (`www.ahrq.gov`) require CloudFront invalidation after Drupal cache flush:

```bash
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/path/*" \
  --region us-east-1 --output json --profile 406380712964_ct-ahrqgov-dev-role
```

> ⚠️ **Jenkins/bastion roles lack `cloudfront:CreateInvalidation`.**
> Always use local profile `406380712964_ct-ahrqgov-dev-role` for CloudFront operations.

### Wait for CloudFront Invalidation to Complete

**MANDATORY** before content verification. The invalidation ID is returned in the `create-invalidation` response.

```bash
# Automated wait (recommended)
aws cloudfront wait invalidation-completed \
  --distribution-id <DISTRIBUTION_ID> \
  --id <INVALIDATION_ID> \
  --region us-east-1 --profile 406380712964_ct-ahrqgov-dev-role
echo "CloudFront invalidation complete"
```

Typical completion time: **1–5 minutes**. Do NOT proceed to content verification until CloudFront invalidation is complete.

---

## Post-Flush Verification

After both Drupal cache tag invalidation AND CloudFront invalidation are confirmed complete, verify the pages are serving fresh content.

### WAF Bypass Headers (required for `www.ahrq.gov`)

The WAF bypass token is stored in `puppeteer/.env` (in the ahrqgov-drupal repo):

| Header | Value |
|--------|-------|
| `x-bypass-waf` | `$WAF_TOKEN` |
| `aws-cf-cd-test` | `$WAF_TOKEN` |
| `x-ahrq-cd-test` | `$WAF_TOKEN` |

### Verification Command

```bash
WAF_TOKEN=$(grep WAF_BYPASS_TOKEN puppeteer/.env | cut -d= -f2)

curl -s -D - \
  -H "x-bypass-waf: $WAF_TOKEN" \
  -H "aws-cf-cd-test: $WAF_TOKEN" \
  -H "x-ahrq-cd-test: $WAF_TOKEN" \
  -H "Cache-Control: no-cache" \
  "https://www.ahrq.gov/PATH" | head -30
```

### Verification Criteria (all must pass)

| Check | Fresh Value | Stale Value |
|-------|------------|-------------|
| HTTP status | `200` | `403` (WAF block) or `200` (stale) |
| `x-drupal-cache` | `MISS` | `HIT` |
| `last-modified` | Timestamp AFTER cache flush | Timestamp BEFORE cache flush |
| Content spot-check | Expected new content present | Old content still showing |

### Content Spot-Check

```bash
WAF_TOKEN=$(grep WAF_BYPASS_TOKEN puppeteer/.env | cut -d= -f2)

curl -s \
  -H "x-bypass-waf: $WAF_TOKEN" \
  -H "aws-cf-cd-test: $WAF_TOKEN" \
  -H "x-ahrq-cd-test: $WAF_TOKEN" \
  "https://www.ahrq.gov/PATH" | grep -i "EXPECTED_CONTENT"
```

> ⚠️ If `x-drupal-cache: HIT` persists after invalidation, wait and retry — a different CloudFront edge may be serving cached content.

---

## Drush Cache Commands Reference

| Command | Scope | Disruption |
|---------|-------|------------|
| `drush cache:tag node:NID` | Single node | Minimal |
| `drush cache:tag view:frontpage` | Single view | Minimal |
| `drush cache:tag config:system.site` | Site config | Minimal |
| `drush cr` | ALL cache bins (Redis + DB) | Full rebuild |

---

## Key Learnings

1. **Use `ec2 describe-instances` NOT `autoscaling describe-auto-scaling-groups`:** Instances are tagged with `aws:autoscaling:groupName` but are detached from the ASG (ASG API shows 0 instances). Use EC2 tag filter instead.
2. **Correct Drush Command:** `drush cache:tag node:NID` (not `php:eval` with `\Drupal\Cache\Cache::invalidateTags()`)
3. **All Instances Required:** Cache must be cleared on ALL running instances (Redis is external ElastiCache but PHP opcode caches are local)
4. **Admin URLs Bypass CloudFront:** No CDN invalidation needed for `admin.ahrq.gov` or `effectivehealthcare-admin.ahrq.gov`
5. **Blue vs Live ASGs:** Each environment has a Blue ASG and a Live ASG. Clear cache on the correct one based on deployment state.
6. **Jenkins Lacks CloudFront Permissions:** The `AHRQGOV_Jenkins` role does not have `cloudfront:CreateInvalidation`. Use local profile `406380712964_ct-ahrqgov-dev-role` for CloudFront invalidations.
7. **WAF Bypass Required for Verification:** Public URLs (`www.ahrq.gov`) require three WAF bypass headers. Token is in `puppeteer/.env` as `WAF_BYPASS_TOKEN`.
8. **Always Verify `last-modified` After Flush:** Confirm `x-drupal-cache: MISS` and `last-modified` timestamp is AFTER the flush time. This is the definitive proof the page was re-rendered.
9. **Wait for CloudFront Invalidation Before Verifying:** Use `aws cloudfront wait invalidation-completed` before checking page freshness. Typical time: 1–5 minutes.

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| SSM connectivity issues | See [`aws-ssm-connection`](../aws-ssm-connection/SKILL.md) troubleshooting | Follow connection skill's error table |
| Empty instance list from discovery | ASG tag name wrong or no running instances | Verify ASG tag name from table above; check for running instances |
| Pages still stale after `cache:tag` | CloudFront cache on public URL | Run CloudFront invalidation (see above) |
| `No such container` | Container name incorrect | Run `docker ps` recipe (#4) to verify |
| `Route resolution exception` | Stale route cache | Use full `drush cr` instead of surgical tag invalidation |
| `AccessDenied: cloudfront:CreateInvalidation` | Wrong profile used | Use local profile: `--profile 406380712964_ct-ahrqgov-dev-role` |
| `403 Forbidden` on curl verification | WAF blocking request | Add WAF bypass headers; token in `puppeteer/.env` |
| `x-drupal-cache: HIT` after flush | CloudFront still serving stale | Wait for CloudFront invalidation to complete, then retry |

## Redis Notes

- **Location:** AWS ElastiCache (external to Docker containers)
- **Cache Prefix:** Isolated by environment (blue/live separate per AQD-9452)
- **Test:** `sudo docker exec <CONTAINER> drush cache:get system.site`

## References

- **Dependency:** [`aws-ssm-connection`](../aws-ssm-connection/SKILL.md) — SSM connectivity, instance discovery, profiles
- **Tickets:** AQD-9432 (Cache Runbook), AQD-9452 (Redis isolation), AQD-9309 (Route cache)
- **Verified:** 2026-09-04 — All cache clears, CloudFront invalidation, and post-invalidation verification tested against AHRQ production

---

## Slack Notification Template

After cache flush completion, use this template to notify the requester in Slack:

### Standard Completion Message

```
:white_check_mark: Cache flush complete for [PROJECT] [CONTENT_TYPE]

**Drupal Cache:** Nodes [NODE_IDS] invalidated on [COUNT] prod instances via drush cache:tag
**CloudFront:** Invalidation ID [INVALIDATION_ID] — paths revalidated in ~[TIME]min
**Verification:** All content verified fresh from origin

[Optional: Note any path corrections or issues discovered]
```

### Template with Substitutions

```
:white_check_mark: Cache flush complete for AHRQ CAHPS database pages and PDFs

**Drupal Cache:** Nodes 238852 & 237720 invalidated on 3 prod instances via drush cache:tag
**CloudFront:** Invalidation IDs I2SM02949QDHQ13BNK5WYRNRUV & I1IQTM6FJO9L54TFJJULIUEOSP — paths revalidated in ~2min
**Verification:** All content verified fresh from origin (x-cache: Miss from cloudfront)

:warning: Note: PDF paths in request contained extra `/data-research/` subdirectory. Corrected paths used: `/wysiwyg/cahps/cahps-database/cahps-data-research-abstract-form-*.pdf`
```

### Minimal Version (1 liner for chat)

```
:white_check_mark: [PROJECT] cache flush complete — [COUNT] nodes invalidated, CloudFront revalidated, all content verified fresh.
```

---

## How to Generate the Message

At task completion, gather:
1. **PROJECT**: AHRQ, EHC, or PSO
2. **CONTENT_TYPE**: "pages", "PDFs", "pages and PDFs", etc.
3. **NODE_IDS**: e.g., `238852 & 237720`
4. **COUNT**: Number of production instances (typically 3)
5. **INVALIDATION_ID**: From CloudFront `create-invalidation` response
6. **TIME**: Approximate wait time (1–5 minutes typical)
7. **ISSUES**: Any path corrections, missing files, or anomalies discovered

Paste the completed template directly into Slack.
