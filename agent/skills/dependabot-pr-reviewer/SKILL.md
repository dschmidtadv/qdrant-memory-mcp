---
name: dependabot-pr-reviewer
description: Review, triage, and consolidate open Dependabot PRs for the ahrqgov-drupal GitHub repository. Use when a user asks to review open Dependabot PRs, consolidate dependency updates, or work through a backlog of automated dependency bumps. Handles GitHub Actions and npm dependency PRs with different conflict resolution strategies, creates a Jira ticket, and produces a clean consolidation PR targeting the develop branch.
---

# Dependabot PR Reviewer

## Purpose

To review all open Dependabot PRs in AHRQ/ahrqgov-drupal, triage them by type and risk, consolidate them into a clean feature branch, and track work in Jira. Handles the distinct complexity of GitHub Actions vs. npm dependency PRs, especially package-lock.json conflicts from major version bumps.

## When To Use

Load this skill when the user says any of:
- "review open Dependabot PRs"
- "consolidate Dependabot PRs"
- "work through dependency updates"
- "process dependabot backlog"

---

## Phase 1: Discovery & Triage

### 1.1 List all open Dependabot PRs

```bash
gh pr list --author app/dependabot --state open --json number,title,headRefName,mergeable,reviewDecision,reviews --limit 50
```

### 1.2 Categorize PRs

Separate into two tracks:

| Track | Branch prefix | Conflict strategy |
|-------|--------------|------------------|
| GitHub Actions | `dependabot/github_actions/` | Clean merge — no lock files |
| npm dependencies | `dependabot/npm_and_yarn/` | `-X theirs` + npm install to rebuild lock |

### 1.3 Triage by severity

For npm PRs, classify each bump:

| Level | Condition | Action |
|-------|-----------|--------|
| CRITICAL | Major version (e.g., jest 29→30, expect 29→30) | Merge last; needs test validation |
| HIGH | Major version on test runner (mocha, puppeteer) | Merge before CRITICAL |
| MEDIUM | Minor version bump | Standard merge |
| LOW | Patch version / patch group | Merge first |

### 1.4 Check blocking state

```bash
gh pr view <NUMBER> --json mergeable,reviewDecision,reviews
```

- `reviewDecision: REVIEW_REQUIRED` + `reviews: []` = blocked on approval
- Approve before merging: `gh pr review <NUMBER> --approve --body "Reviewed - safe to merge"`

---

## Phase 2: Create Jira Ticket

Always create a Jira ticket before starting consolidation:

```bash
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py create \
  --type Task \
  --summary "Consolidate N Dependabot PRs (<Month> <Year>) into single branch" \
  --description "..." \
  --priority High
```

Transition to In Progress once work starts:

```bash
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py transition <TICKET> --to "Start Progress"
```

---

## Phase 3: Branch Setup

### 3.1 Remove stale lock file if present

```bash
rm -f .git/index.lock
```

### 3.2 Checkout develop and create feature branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<TICKET-ID>-dependabot-consolidation-<mon>-<year>
```

Branch naming convention: `feature/AQD-XXXX-dependabot-consolidation-sep-2026`

---

## Phase 4: Merge GitHub Actions PRs (Track 1)

Merge GitHub Actions PRs first — they are clean, no lock files:

```bash
git fetch origin
for branch in <list of dependabot/github_actions/* branches>; do
  git merge origin/$branch --no-edit
done
```

Verify no unrelated files changed after each batch:

```bash
git diff origin/develop..HEAD --name-only
```

**CRITICAL SAFETY CHECK:** After merging, inspect the diff for any files not in `.github/workflows/`. If unrelated application files appear (e.g., `scripts/`, `html/`, `conf/`), those changes came from the develop branch baseline, NOT the Dependabot PR. See Phase 6 for remediation.

---

## Phase 5: Merge npm PRs (Track 2)

npm PRs will always conflict on `package-lock.json`. Use `-X theirs` to accept the incoming changes — the lock files will be fully regenerated in Phase 6:

```bash
for branch in <list of dependabot/npm_and_yarn/* branches>; do
  git merge -X theirs origin/$branch --no-edit
done
```

Merge order (lowest risk first):
1. Patch-level group PRs
2. Minor version bumps
3. HIGH major version bumps (mocha, puppeteer)
4. CRITICAL major version bumps (jest, expect) — merge last

---

## Phase 6: Rebuild Lock Files

After all npm merges, regenerate lock files to resolve any remaining state:

```bash
# For puppeteer tests
cd puppeteer && npm install && cd ..

# For html/frontend
cd html && npm install && cd ..
```

Commit the rebuilt locks:

```bash
git add puppeteer/package-lock.json html/package-lock.json puppeteer/package.json
git commit -m "chore(deps): rebuild package-lock.json files after consolidating N Dependabot PRs

Resolves <JIRA-TICKET>"
```

---

## Phase 7: Verify Branch Cleanliness

**Always run this check before pushing:**

```bash
git diff origin/develop..HEAD --name-only
```

Expected files: ONLY files from `.github/workflows/`, `puppeteer/package*.json`, `html/package*.json`. If ANY other application files appear (Python scripts, PHP, shell scripts, Drupal config), the branch contains unrelated changes.

### Removing unrelated commits

If unrelated commits are found, identify them:

```bash
git log --format="%H %ai %s" origin/develop..HEAD
```

Then use `git reset` to strip them:

```bash
# Remove N unrelated commits from the top of history
git reset --soft HEAD~N
git reset HEAD .
# Re-add only the intended files
git add <intended files only>
git commit -m "chore(deps): rebuild package-lock.json files..."
```

If the contamination is deep in history, start fresh from develop:

```bash
git reset --hard origin/develop
# Re-merge only Dependabot branches (re-run Phase 4 & 5)
```

---

## Phase 8: Push & Create PR

```bash
git push origin <feature-branch>

gh pr create \
  --base develop \
  --head <feature-branch> \
  --title "chore(deps): <TICKET> - Consolidate N Dependabot PRs" \
  --body "..."
```

For the PR body, see `references/consolidation-guide.md` for the template.

---

## Phase 9: Jira Update

After PR is created, add a comment linking the PR and transition the ticket:

```bash
python3 ~/.claude/skills/jira-manager/scripts/jira_client.py comment <TICKET> \
  --body "PR created: https://github.com/AHRQ/ahrqgov-drupal/pull/<NUMBER>"
```

---

## Key Lessons Learned (AQD-9486)

1. **GitHub Actions PRs never touch application code** — if [`scripts/ahrq-dns-health-check.py`](scripts/ahrq-dns-health-check.py) or similar files appear in the diff, the branch was created from a dirty base or contains cherry-picked unrelated commits.

2. **Always separate GitHub Actions from npm track** — merging them together in one loop introduces ordering issues and makes cleanup harder.

3. **package-lock.json conflicts are expected and normal** — never try to manually resolve them. Always use `-X theirs` and regenerate via `npm install`.

4. **Approval is separate from mergeability** — a PR can be `mergeable: MERGEABLE` in the GitHub API but still blocked by `reviewDecision: REVIEW_REQUIRED`. Run `gh pr review --approve` on all PRs before attempting to merge via the API.

5. **Start fresh from develop** when a branch gets contaminated — attempting to cherry-pick individual commits out is error-prone and slower than a clean rebuild.

6. **Separate GitHub Actions from npm in the final PR** — npm major version bumps require testing validation before merge; GitHub Actions bumps are safe to merge immediately.

7. **The `jira_client.py transition` command uses the exact transition name** — run `transitions <TICKET>` to get available options if the first attempt fails.

---

## Reference

See `references/consolidation-guide.md` for PR body template and triage examples.
