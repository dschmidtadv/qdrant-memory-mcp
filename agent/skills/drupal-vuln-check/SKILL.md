---
name: drupal-vuln-check
description: Check Drupal core/contrib projects for known security vulnerabilities and file Jira tickets for findings
---

# Drupal Vulnerability Check Skill

## Overview

Scans a Drupal project's dependencies for known security advisories and files a Jira ticket per finding (or one rollup ticket per run, see Ticket Strategy) using the `jira-manager` skill's `jira` CLI (`~/.local/bin/jira`, delegating to `jira_client.py` — talks directly to the Jira REST API via a PAT from `.env`, no MCP server involved). Covers AHRQ, EHC, and PSO Drupal codebases (`ahrqgov-drupal`, `ehc-drupal`, and any other `composer.json`-based Drupal project under `~/apps`).

This skill does not patch anything. It only detects and reports. Applying updates is a separate, human-reviewed change (composer.json edits, testing, deploy) and is out of scope.

## When to Use

- Recurring/scheduled security audits of AHRQ, EHC, or PSO Drupal codebases
- Before a release or deploy, to confirm no known-vulnerable packages are shipping
- After a Drupal Security Advisory (SA) is published, to check exposure across all managed sites
- Ad hoc: "check ehc-drupal for vulnerabilities", "did the latest Drupal SA affect us"

## Prerequisites

- Local checkout of the Drupal project (composer.json must be readable)
- PHP + Composer available, either locally or inside the project's running Docker container
- The `jira` CLI shim installed at `~/.local/bin/jira` and on `PATH` (one-time setup: `make install-jira` from the `qdrant-memory-mcp` project root — see the `jira-manager` skill). This does NOT depend on any MCP server connection; it's a stdlib-only Python script that hits the Jira REST API directly.
- The project's own `.env` file with `JIRA_INSTANCE_URL`, `JIRA_PAT`, and `JIRA_PROJECT_KEY` (the `jira-manager` skill's expected variable names — note these differ from the older `JIRA_URL`/`JIRA_TOKEN` names seen in some `jira-sync`-era `.env` files; `jira_client.py` reads the `jira-manager` names)

**Do not use the `jira-sync` MCP server / `@jira-sync` tools for this skill.** That MCP server has been unreliable (confirmed `CONNECTION_CLOSED` in testing) and this skill's ticket-filing steps below use the `jira` CLI instead, which requires no MCP connection at all.

## Step 0: Identify the Target Project and Its Jira Config

Do not hardcode a Jira project key. Read it from the project being checked:

```bash
# Run from the Drupal project root (e.g. ~/apps/ehc-drupal, ~/apps/ahrqgov-drupal)
grep -E "^JIRA_PROJECT_KEY=|^JIRA_INSTANCE_URL=" .env
```

If the project itself has no `.env` with Jira config, check for a sibling ops/deploy repo that does (e.g. this workspace keeps Jira credentials in `~/apps/dexi/.env` for some projects, though check its variable names match `jira-manager`'s expectations — see Prerequisites). Ask the user which `.env` / project key to use rather than guessing — different sites have filed tickets under different keys historically.

**Run the mandatory pre-flight gate before anything else** (per the `jira-manager` skill — this is a blocking gate, not optional):

```bash
# From the Drupal project root, so it picks up that project's own .env
jira check
```

**Resolved blocker — shared credentials now in place:** `jira check` originally failed for `ahrqgov-drupal` (project `AQD`) and `pso-drupal` (project `PSOD`) with `Error: Missing required environment variables: JIRA_INSTANCE_URL, JIRA_PAT`, because `qdrant-memory-mcp/.env` (where `jira_client.py` looks for shared credentials, per its own error message) didn't exist. **Confirmed with the user: `JIRA_INSTANCE_URL`/`JIRA_PAT` are the same across all AHRQ/EHC/PSO projects — only `JIRA_PROJECT_KEY` differs per project.** Fixed by extracting those two vars from `ehc-drupal/.env` (the one project that already had them) into a new `qdrant-memory-mcp/.env`, `chmod 600`'d and confirmed already covered by that repo's `.gitignore`. `jira check` now passes for all three projects (`EHCD`, `AQD`, `PSOD`).

If this file is ever missing again (e.g. on a fresh machine, or if it gets deleted): pull `JIRA_INSTANCE_URL`/`JIRA_PAT` from any project's `.env` that already has them (`ehc-drupal` is the known-good source as of 2026-09-03), write only those two lines into `qdrant-memory-mcp/.env`, and `chmod 600` it. Do not put a `JIRA_PROJECT_KEY` in that shared file — it must stay per-project so each caller's own `.env` continues to determine which project tickets land in. Never invent or guess a PAT, and never pull one from a project whose PAT you haven't confirmed is meant to be shared — ask the user first if it's unclear, same as was done here.

Expect `✅ JIRA connectivity OK` with the correct instance URL and project key echoed back. If this fails, stop and surface the error to the user — do not proceed to search or file tickets (see the `jira-manager` skill's failure-mode table for what each error means).

## Step 1: Pin the Scan to `develop` — Never the Working Copy

**Do not run `composer audit` against whatever happens to be checked out locally or baked into a running container.** Local checkouts in this workspace sit on arbitrary feature/hotfix/stage branches (confirmed: `ehc-drupal` was on `stage`, `ahrqgov-drupal` on a `bugfix/*` branch), and a running container's filesystem can diverge further still from anything in git (bind mounts, hotfixes applied in place). None of that reflects what's actually merged. The scan must always target `composer.lock` as committed on `develop` — the integration branch other branches merge into and where dependency versions are the closest thing to ground truth for "what we're about to ship."

**Extract `composer.lock` (and its paired `composer.json`) from `origin/develop` without touching the working tree:**

```bash
# Run from inside the project repo (e.g. ~/apps/ehc-drupal, ~/apps/ahrqgov-drupal, ~/apps/pso-drupal)
git fetch origin develop --quiet

# Confirm the branch path to composer.json/lock (varies: repo root vs html/ subdir)
git ls-tree -r origin/develop --name-only | grep -E '(^|/)composer\.(json|lock)$'
```

Known layouts in this workspace (verified 2026-09-03, `html/` subdir pattern for both):
- `ehc-drupal`: `html/composer.json`, `html/composer.lock`
- `ahrqgov-drupal`: `html/composer.json`, `html/composer.lock`
- `pso-drupal`: confirm path with the `git ls-tree` command above before assuming `html/`

Then extract both files into a throwaway directory — **never `git checkout develop`** in a repo that may have someone's uncommitted work on another branch:

```bash
mkdir -p /tmp/drupal-audit-<project>
cd <project-repo-root>
git show origin/develop:html/composer.json > /tmp/drupal-audit-<project>/composer.json
git show origin/develop:html/composer.lock > /tmp/drupal-audit-<project>/composer.lock
```

This is read-only against git's object store — it does not alter the working directory, the current branch, or any running container. Clean up the temp directory after the run.

If the user specifically wants the scan run against a *different* branch (a release candidate, a specific PR branch) instead of `develop`, substitute that ref in the `git show <ref>:path` calls — but `develop` is the default target for routine/scheduled checks, not the currently-checked-out branch.

## Step 2: Run the Vulnerability Scan

**Primary method — `composer audit --locked`:**

```bash
cd /tmp/drupal-audit-<project>
COMPOSER_CAFILE=/etc/ssl/cert.pem composer audit --format=json --locked
```

The `--locked` flag tells Composer to read `composer.lock` directly rather than requiring an installed `vendor/` — necessary here since the temp directory has no vendor install. `composer audit` checks the locked package versions against the FriendsOfPHP security advisory database, which includes Drupal core and most contrib packages that publish advisories via Packagist/security.symfony.com feeds.

The `COMPOSER_CAFILE=/etc/ssl/cert.pem` prefix works around a confirmed local CA-bundle issue (see blocker below) — without it, this command reliably fails with a curl SSL error on this machine. If `/etc/ssl/cert.pem` doesn't exist on a future machine, substitute any current, complete system CA bundle.

**Exit code note:** `composer audit` exits `3` when vulnerabilities are found — that's success with findings, not a failure. Only treat a non-JSON error message on stderr, or exit codes other than `0`/`3`, as an actual run failure.

**Resolved blocker — wrong CA bundle selected, fixed with `COMPOSER_CAFILE` env var:** `composer audit` can fail on this machine with `curl error 60: SSL certificate problem: unable to get local issuer certificate` when reaching `packages.drupal.org`, even though `curl` itself reaches the same URL fine. This is NOT a corporate proxy/TLS-interception problem — `packages.drupal.org`'s real certificate chain is signed by GlobalSign, with no Zscaler or other MITM cert anywhere in the actual handshake (verified via `openssl s_client` and `curl -v`). The failure has two independent causes, both confirmed by direct reproduction:

1. **The project's own `composer.json` sets `"config"."cafile"` to a Zscaler-only root cert** (`/usr/local/share/ca-certificates/ZscalerRootCertificate-2048-SHA256.crt`). That cert is real and valid, but it cannot validate `packages.drupal.org`'s GlobalSign-issued chain on its own — confirmed by setting `COMPOSER_CAFILE` to that same Zscaler cert and reproducing the identical failure. This cafile setting is presumably correct for a different network context (e.g. a corporate VPN that actually does intercept TLS) but is the wrong bundle when running from a network path that doesn't.
2. **This Composer version does not appear to honor the global `~/.composer/config.json` `"cafile"` key** for this request path — even after confirming `composer config -g cafile` correctly resolves to a full, valid system CA bundle (a Python certifi bundle at `.../certifi/cacert.pem`, independently confirmed via `openssl s_client -CAfile` to validate `packages.drupal.org` cleanly), `composer audit` still failed using only that config-file setting.

**The fix, confirmed working:** set the `COMPOSER_CAFILE` **environment variable** (not just the config file) to a full, valid CA bundle — e.g. the same certifi path already in the global config — when invoking `composer audit`:

```bash
COMPOSER_CAFILE=/Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/site-packages/certifi/cacert.pem \
  composer audit --format=json --locked
```

This ran successfully against `ehc-drupal`'s `develop` lockfile and returned real findings, including `dompdf/dompdf` vulnerable to `CVE-2026-59943` (medium, affects versions `<3.1.6`) — confirming both the fix and that the overall scan pipeline works end-to-end. If the certifi path above doesn't exist on a future machine, substitute any current, complete system CA bundle (on macOS, `/etc/ssl/cert.pem` is a safe default — confirmed via `curl -v` to already validate this host correctly). Do not use the project's Zscaler-only cafile for this purpose; it is not sufficient by itself, and do not resolve this by setting `disable-tls`/`secure-http: false` (already set globally in this environment, which is itself worth flagging separately — it weakens Composer's default security posture beyond what's needed for the specific cafile problem above).

**Known blocker — truncated composer.json in the live PSO container only (confirmed NOT present on develop):** As of 2026-09-03, `pso-drupal-web-1`'s live `/var/www/html/composer.json` is truncated mid-file — it cuts off at exactly line 450 (450 lines / 15,469 bytes total) in the middle of the `"append-robots-customizations"` script array, which never gets closed. This makes `composer audit`/`composer validate` fail immediately with a JSON parse error on that container. **Verified this is a live-deployment artifact, not a repo problem:** `git show origin/develop:html/composer.json` for `pso-drupal` produces a complete, valid 538-line/18,835-byte file with the same array properly closed — confirmed with `python3 -c "import json; json.load(open('composer.json'))"` returning no error. Since Step 1 already scans the `develop` extraction rather than the live container, this blocker should not actually affect normal runs of this skill — it only matters if you deliberately point the scan at the live container's filesystem instead (e.g. via `docker exec`, as a live-state sanity check alongside 2b). If you do that and hit the parse error:
1. Do NOT hand-edit a production container's composer.json without the user's explicit go-ahead.
2. Fall back to Step 2b (drush-based check, same live-container caveat applies) or Step 2c for that check instead.
3. Flag the truncation itself as a finding worth its own ticket — a live container running on a shorter, differently-configured composer.json than what's on `develop` is a deployment-drift risk independent of any CVE, and worth investigating (how did the file get truncated: bad image build layer? incomplete bind-mount copy? manual edit that didn't save fully?).

**Fallback method 2b — drush + Security Advisories module (if installed):**

`drush` inspects the *running site's* database/codebase state, not an arbitrary git ref, so this method inherently checks whatever is live in the container — not `develop`. Use it only to sanity-check the live deployment separately, and label findings from it explicitly as "live container state," not "develop branch state," in the report:

```bash
docker exec <container-name> drush pm:security --format=json
```

This only works if the site bootstraps cleanly. It will NOT work on a container with a broken/missing custom module reference (drush bootstrap fails entirely in that case — check `drush status` first). If drush fails to bootstrap, do not attempt to fix the site's module registration as part of a vulnerability check; report the bootstrap failure as a separate, non-security finding and move to 2c.

**Fallback method 2c — manual version check against drupal.org:**

Run this against the `develop`-extracted `composer.json` in `/tmp/drupal-audit-<project>`, not the working copy, to stay consistent with Step 1:

```bash
grep -E '"drupal/core"|"drupal/core-recommended"' /tmp/drupal-audit-<project>/composer.json
```

Take the reported version and cross-reference against published Drupal core Security Advisories at https://www.drupal.org/security (core) and https://www.drupal.org/security/contrib (contrib modules) for the specific module names in composer.json's `require` block. This is manual and slower — only use it when 2 and 2b are both blocked.

## Step 3: Triage Results

For each finding from `composer audit`, extract:
- Package name and installed version
- Advisory ID / CVE
- Severity (as reported by the advisory source — do not invent a severity if the tool doesn't report one)
- Link to the advisory

**Parsing gotcha (confirmed 2026-09-03):** in `composer audit --format=json` output, `advisories.<package>` is NOT reliably a JSON array. For a package with many advisories (seen with `guzzlehttp/guzzle`, `drupal/core`, `twig/twig` — packages with 5+ entries), Composer/PHP serializes it as a JSON **object** with stringified numeric keys (`{"0": {...}, "1": {...}, ...}`) instead of a list. A parser that assumes a uniform list-of-dicts will throw on the first such package and silently truncate everything after it — this happened during testing and initially hid ~55 of 65 real findings on `pso-drupal` (including a critical `twig/twig` code-injection CVE and several critical/high `drupal/core` advisories) before the bug was caught. Always normalize before iterating:

```python
def normalize_advisories(advs):
    return list(advs.values()) if isinstance(advs, dict) else advs
```

Apply this to every package's advisory list, not just ones that look large — do not assume that only large lists trigger it. Also: some individual advisories omit `cve` entirely (present but `null`/absent — seen on `aws/aws-sdk-php`) or omit `severity` (seen on several `drupal/*` contrib SAs, which report severity as free text like "Moderately critical" outside the JSON `severity` field) — handle both as "not reported by the tool," never invent a value, and don't let a missing field crash the loop either.

Do not deduplicate against Jira yet — that happens in Step 4.

## Step 4: Check for Existing Tickets Before Filing

Avoid duplicate tickets across repeated runs. Before creating a new ticket, search using the `jira` CLI (per `jira-manager`'s Step 8):

```bash
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py search \
  --jql 'project = <PROJECT_KEY> AND text ~ "<package-name>"' \
  --max 20
```

JQL's `text ~` is a fuzzy/stemmed match, not a literal substring search — searching on the package name alone (e.g. `"dompdf"`) tends to surface all relevant tickets more reliably than combining package name AND advisory ID in one query, since the advisory ID may not appear verbatim in the summary. Review each result's summary against the current finding rather than trusting the query to have filtered precisely.

If an open or recently-closed ticket already covers this exact advisory for this exact package, **skip filing a new ticket** and instead add a comment noting the re-check date and current status (still present / now resolved):

```bash
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py comment <TICKET-KEY> \
  --body "h3. Re-check <date>

Re-ran composer audit --locked against origin/develop at commit <sha>.

Still present: *<package>/<name> <version>*, same N advisories, no change since this ticket was filed.

|| CVE || Severity || Fixed in ||
| <cve> | <severity> | <fixed-version> |

Detection method: composer audit (locked mode) against develop's composer.lock, per the drupal-vuln-check skill. No code change made; filed for tracking/remediation planning only."
```

Use Jira Wiki Markup in `--body`, not Markdown — `h3.` not `###`, `*bold*` not `**bold**`, `||`/`|` table syntax (see `jira-manager`'s Constraint 3). This was confirmed working in testing against `ehc-drupal`'s `EHCD-3382`.

## Step 5: File Tickets (Only for Findings With No Existing Ticket)

**Ticket strategy:** One ticket per distinct advisory (not per package-version pair, not one giant rollup ticket) — this matches how patches are typically applied and tracked individually. Use `Bug` or `Task` issue type per team convention (check recent similar tickets in the project with a JQL search first if unsure — the search in Step 4 already gives you this context).

```bash
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py create \
  --project <PROJECT_KEY> \
  --type Bug \
  --summary "[Security] <package> <version> vulnerable to <advisory-id>" \
  --description "<see required fields below, in Jira Wiki Markup>" \
  --priority <severity-derived, see below>
```

Ticket description should include, at minimum:
- Site/environment affected (AHRQ / EHC / PSO, prod/stage)
- **Git ref the finding was scanned against** (`origin/develop` at commit `<sha>` — get with `git rev-parse origin/develop`) so remediation work targets the right branch and re-checks are reproducible
- Package name, installed version, and first patched version (if the advisory specifies one)
- Advisory ID and link
- Severity as reported by the source
- Detection method used (composer audit / drush pm:security / manual) and date checked
- Explicit note that this ticket is for tracking/remediation planning — no code change has been made

Do not mark severity or priority fields based on your own judgment of impact beyond a direct mapping from the advisory's own rating (e.g. critical/high → Jira `High`, medium → `Medium`, low → `Low`); let the assignee/triage step make any further adjustment.

**Before filing, always run `jira check` (Step 0) if it's been a while since the last call in this session** — a stale or expired PAT fails at write time, not at search time, so don't assume connectivity still holds just because Step 4's search succeeded a while ago.

## Step 6: Report Back

Summarize to the user:
- Which project(s) were checked and by which method (audit / drush / manual)
- Number of findings, broken down by severity as reported
- Ticket keys created, and any skipped as duplicates
- Any blockers hit (e.g. malformed composer.json, drush bootstrap failure) that limited scan coverage — be explicit that these mean the scan may be incomplete, not clean

## Non-Goals

- Do not run `composer update`, `composer require`, or edit `composer.json`/`composer.lock` as part of this skill. That's a separate change with its own testing/deploy process.
- Do not restart containers or touch production traffic.
- Do not assume a package is safe because it wasn't flagged — `composer audit` only knows about advisories in its feed; a fallback method should be used periodically to catch gaps, especially for Drupal-specific contrib modules that don't always appear in the FriendsOfPHP feed.

## References

- `jira-manager` skill — the `jira` CLI this skill uses for all ticket search/comment/create operations (setup, `.env` config, Jira Wiki Markup rules, auth troubleshooting)
- `ahrq-cache-flush` skill — example of the AHRQ/EHC/PSO environment layout and ticket-footer conventions this skill follows
- Drupal core security advisories: https://www.drupal.org/security
- Drupal contrib security advisories: https://www.drupal.org/security/contrib
- Composer audit docs: https://getcomposer.org/doc/03-cli.md#audit

**Verified:** 2026-09-03 — Full skill run executed end-to-end against `ehc-drupal`, Steps 0 through 4 (Step 5 not exercised since Step 4 found an exact-duplicate ticket — see below). `git show origin/develop:html/composer.lock` (and `composer.json`) extraction confirmed working with no working-tree mutation. `composer audit --locked`, run with `COMPOSER_CAFILE` set to a full system CA bundle, ran successfully and returned 6 real findings (`dompdf/dompdf` v2.0.8 on `develop`, vulnerable to CVE-2026-59943/-59942/-59941/-56722 (medium) and CVE-2026-55555/-55554 (low), all fixed in `>=3.1.6`). Root-caused the earlier SSL failure: `packages.drupal.org`'s real cert chain is signed by GlobalSign with no TLS interception involved (confirmed via `openssl s_client`/`curl -v`); the project's own `composer.json`-level `cafile` points at a Zscaler-only root that cannot validate this chain by itself, and this Composer version does not apply the global `~/.composer/config.json` `cafile` key to this request path — only the `COMPOSER_CAFILE` env var reliably works. **Ticket-filing path corrected:** this skill originally documented `@jira-sync` MCP tools for Steps 0/4/5, but the `jira-sync` MCP server proved unreliable in practice (`CONNECTION_CLOSED`); switched all ticket-search/comment/create steps to the `jira-manager` skill's `jira` CLI instead, which talks to the Jira REST API directly and has no MCP dependency. Confirmed working end-to-end: `jira check` passed against `ehc-drupal`'s real `.env` (project `EHCD`, instance `cmext.ahrq.gov/jira`); `jira_client.py search --jql 'project = EHCD AND text ~ "dompdf"'` found an exact-match existing ticket (`EHCD-3382`, same package/version/vulnerability-count, status `To Do`); per Step 4's dedup rule, skipped creating a duplicate and instead posted a re-check comment to `EHCD-3382` in Jira Wiki Markup, confirmed successful (`✅ Added comment to: EHCD-3382`). `composer audit`/`composer validate` (non-`--locked`, against live container filesystem) separately confirmed functional (Composer 2.8.3 / PHP 8.3.31) inside `pso-drupal-web-1` in principle, but blocked there by a truncated `composer.json` (450 lines, cuts off mid-array). **Confirmed the truncation is local to the live container only:** `pso-drupal`'s `origin/develop:html/composer.json` is a complete, valid 538-line file — the container's copy is missing its last ~88 lines, meaning that container is running on drift from what's committed, independent of any CVE finding. `drush pm:security` confirmed blocked on the same container due to an unrelated bootstrap failure (missing `test_helper` custom module) — this reflects live container state only, never `develop`. Neither `ehc-drupal` nor `ahrqgov-drupal` composer.json currently declares a dedicated security-advisories package; core/contrib versions must be checked directly. `develop` confirmed as the default branch (`origin/HEAD`) in all three repos (`ehc-drupal`, `ahrqgov-drupal`, `pso-drupal`). **Not yet verified:** Step 5 (actually filing a brand-new ticket) — every finding tested so far already had an existing ticket, so the `create` command path is documented but unexercised; verify it end-to-end the next time a genuinely new finding surfaces.
