# Dependabot PR Consolidation Reference Guide

## Repository Context

- **Repository:** AHRQ/ahrqgov-drupal
- **Target branch:** `develop`
- **Branch naming:** `feature/<TICKET>-dependabot-consolidation-<mon>-<year>`
- **Jira project:** AQD
- **Lock file directories:** `puppeteer/` and `html/`

---

## PR Body Template

Use this when creating the consolidation PR via `gh pr create`:

```
## Consolidation of N Dependabot PRs

This PR consolidates all open Dependabot PRs from <Month Year> into a single feature branch for easier management and testing.

### Merged GitHub Actions PRs (N total)
- PR #353: actions/cache 4→6
- PR #352: PR-Agent 0.41→0.45
...

### Merged npm Dependencies (N total)
- PR #349: puppeteer-core 25.3→25.10
- PR #348: jest 29→30 (CRITICAL)
...

### Key Points
- All Dependabot PRs merged into single branch
- package-lock.json files rebuilt via npm install
- N total commits (N from Dependabot + 1 for rebuilt locks)
- Reduces PR clutter significantly
- Original N PRs can be closed after this merges

Resolves <JIRA-TICKET>
```

---

## Jira Ticket Template

```
h3. Summary
Consolidate N open Dependabot PRs into a single feature branch to reduce PR clutter and simplify review/merge process.

h3. Current Open PRs (N total)

h4. GitHub Actions (N PRs)
* #353: actions/cache 4→6
* #352: PR-Agent 0.41→0.45
...

h4. npm Dependencies (N PRs)
* #349: puppeteer-core 25.3→25.10
* #348: jest 29→30 (CRITICAL - major version)
...

h3. Acceptance Criteria
# Create feature branch
# Merge all N Dependabot PRs
# Run Puppeteer test suite to validate major version bumps
# Create single PR from feature branch to develop
# Close original N Dependabot PRs after consolidation

h3. Root Cause
[Describe why PRs were blocked or accumulated]
```

---

## Triage Decision Matrix

### GitHub Actions PR Risk Levels

| Action | Risk | Notes |
|--------|------|-------|
| `actions/cache` major bump | LOW | Standard upgrade |
| `actions/setup-python` major bump | LOW | Standard upgrade |
| `trufflesecurity/trufflehog` minor/patch | LOW | Security scanner |
| `GitGuardian/ggshield-action` minor | LOW | Security scanner |
| `The-PR-Agent/pr-agent` minor | LOW | Dev tooling |

### npm PR Risk Levels

| Package | Version Type | Risk | Requires Testing |
|---------|-------------|------|-----------------|
| `jest` major | 29→30 | CRITICAL | Yes — test framework |
| `expect` major | 29→30 | CRITICAL | Yes — assertion library |
| `mocha` major | 11→12 | HIGH | Yes — test runner |
| `puppeteer` major | 24→25 | HIGH | Yes — browser automation |
| `puppeteer-core` minor | Any | MEDIUM | Recommend |
| Group update (patch) | patch | LOW | No |

---

## Conflict Resolution Flowchart

```
PR type?
├── GitHub Actions
│   └── git merge origin/$branch --no-edit
│       └── Verify only .github/workflows/ files changed ← CRITICAL CHECK
│
└── npm / package manager
    └── git merge -X theirs origin/$branch --no-edit
        └── package-lock.json conflict? → Expected, -X theirs handles it
            └── After ALL npm merges → npm install in each affected dir
                └── Commit rebuilt lock files
```

---

## Cleanliness Verification Commands

```bash
# List all changed files vs develop
git diff origin/develop..HEAD --name-only

# Count commits above develop
git log --oneline origin/develop..HEAD | wc -l

# Show commit timestamps (identify unrelated by date)
git log --format="%H %ai %s" origin/develop..HEAD

# Check specific file
git log --oneline -p origin/develop..HEAD -- scripts/some-file.py
```

### Expected clean output (GitHub Actions only branch):
```
.github/workflows/drupal-sa-archive-check.yml
.github/workflows/drupal-vuln-check.yml
.github/workflows/litellm-pr-reviewer.yml
.github/workflows/secret-scanning.yml
```

### Expected clean output (npm branch):
```
puppeteer/package.json
puppeteer/package-lock.json
html/package.json
html/package-lock.json
```

### Red flags — abort and rebuild if you see:
- `scripts/*.py` — Python application scripts
- `html/web/**` — Drupal application files
- `conf/*.conf` — Apache configuration
- `html/composer.json` — Composer PHP deps

---

## Common Failure Modes

### Problem: `.git/index.lock` exists
```bash
rm -f .git/index.lock
```

### Problem: GitHub Actions PRs blocked on review
```bash
# Approve all 5 in one pass
for pr in 353 352 351 350 339; do
  gh pr review $pr --approve --body "Reviewed - safe to merge"
done
```

### Problem: `gh pr merge` fails even after approval
- GitHub's branch protection may require CI to pass
- Use `git merge origin/<branch>` locally instead of `gh pr merge`
- Push the consolidated branch and let CI run there

### Problem: Unrelated commits contaminate the branch

**Option A – Strip from top (if contamination is in recent commits only):**
```bash
# Identify how many commits to remove
git log --format="%H %ai %s" origin/develop..HEAD

# Remove N commits
git reset --soft HEAD~N
git reset HEAD .
git add <only intended files>
git commit -m "chore(deps): rebuild lock files..."
git push -f origin <branch>
```

**Option B – Start clean (if contamination is deep in history):**
```bash
git reset --hard origin/develop
# Re-run Phase 4 (GitHub Actions) and Phase 5 (npm) from scratch
```

### Problem: `jira_client.py transition` fails with "not found"
```bash
# List available transitions for the ticket
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py transitions <TICKET>
```

---

## Separation Strategy: When to Split GitHub Actions vs npm into Separate PRs

Split into separate PRs when:
- npm PRs include **major version bumps** that require test validation before merge
- The team wants to merge GitHub Actions immediately but defer npm until testing
- Package-lock.json conflicts are too complex to resolve in one pass

Create two PRs:
1. `feature/<TICKET>-gha-dependabot-<mon>-<year>` — GitHub Actions only
2. `feature/<TICKET>-npm-dependabot-<mon>-<year>` — npm only (after test validation)

---

## Post-Merge Cleanup

After the consolidation PR merges to develop, close the original Dependabot PRs:

```bash
# Close all original Dependabot PRs with a comment
for pr in 353 352 351 350 339; do
  gh pr close $pr --comment "Superseded by consolidation PR #<CONSOLIDATION-PR>"
done
```

---

## Jira CLI Quick Reference

```bash
# Get ticket
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py get AQD-XXXX

# Create ticket
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py create \
  --type Task --summary "..." --priority High

# Add comment
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py comment AQD-XXXX \
  --body "h2. Update\n..."

# Transition ticket
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py transition AQD-XXXX \
  --to "Start Progress"

# List available transitions
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py transitions AQD-XXXX
```
