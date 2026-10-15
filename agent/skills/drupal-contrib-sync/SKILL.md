---
name: drupal-contrib-sync
description: Sync a Drupal module developed in a site's modules/custom folder to its separate drupal.org git clone, then commit, push, and optionally tag a release. Use this skill whenever D wants to sync, publish, push, or release a contrib module he develops inside a site codebase (content_syndication or any other module he maintains on drupal.org), mentions "sync to drupal.org", "push the module upstream", "update the contrib repo", "cut a release" or "tag 1.0.x" for one of his modules, or asks whether the custom copy and the drupal.org copy have drifted. Also use it when he wants to pull upstream drupal.org changes (merged MRs, other contributors' fixes) back into the custom folder. Also use it when working on a Drupal.org project application review (handling "Needs work" feedback, fixing CI pipeline failures, addressing PHPStan baseline issues, fixing PHPUnit functional test ServiceNotFoundException errors, or drafting reply comments for the application issue).
---

# Drupal contrib sync

D develops his contributed modules inside a site repo at `<site>/web/modules/custom/<module>` and keeps a separate git clone of the drupal.org project at `~/apps/drupal-contrib/<module>`. This skill moves changes from the custom copy into the clone, checks them, commits, and pushes to drupal.org after he confirms. It can also tag releases on request.

The helper script does the mechanical parts. Run it from inside the site repo:

```bash
SYNC=<skill-dir>/scripts/contrib_sync.sh
$SYNC <command> <module>
```

Commands are `preflight`, `preview`, `apply`, `leakcheck`, `pullback`, and `record`. The script prints status tokens in caps (`PREFLIGHT_OK`, `UPSTREAM_CHANGES`, `WOULD_OVERWRITE`, `LEAKCHECK_HITS` and similar) so you can branch on them.

If the module name isn't clear from the request, list `~/apps/drupal-contrib/` and the site's `modules/custom/` and ask which one.

## Never push security fixes publicly

If the change fixes a security vulnerability (access bypass, XSS, injection, info disclosure, CSRF and the like), stop before committing in the clone. Projects with security advisory coverage handle these privately with the Drupal security team, and the fix ships together with the advisory. Tell D this, and suggest he keep the fix in the site repo only (or as a private patch) and report it through the security team's process. Ask him directly if you're not sure whether a change is security-related.

## Sync workflow

### 1. Preflight

Run `$SYNC preflight <module>`.

- `NO_CLONE`: the clone doesn't exist yet. Show D the clone command the script printed and run it once he agrees.
- `DIRTY_CLONE`: the clone has uncommitted work. Show it and ask whether to commit it, stash it, or discard it. Never discard without explicit approval.
- `UPSTREAM_CHANGES` with any `WOULD_OVERWRITE` or `WOULD_DELETE` lines: someone (or D through the GitLab UI) changed files on drupal.org that differ from the custom copy. Syncing now would erase that work. Go to the pullback section first, unless D says the overwrite is intended.
- `NO_SYNC_RECORD`: first run for this module. That's fine, but read the preview more carefully because drift can't be detected yet.
- A `NOTE` about uncommitted changes in the site repo is informational. Mention it so D knows unreviewed site work is going upstream.

### 2. Preview

Run `$SYNC preview <module>` and summarize the itemized list for D in plain terms (files added, changed, deleted). `NO_CHANGES` means there is nothing to do; say so and stop.

Deletions deserve a sentence each. A file missing from the custom copy may be intentional, or it may be a drupal.org-only file that should be added to the exclude list (see Configuration).

### 3. Apply and check

Run `$SYNC apply <module>`, which copies the files and stages everything in the clone. Then:

1. Run `$SYNC leakcheck <module>`. It flags staged additions that look like secrets, Riva or AHRQ references, internal hostnames and IPs, Jira keys, email addresses, and leftover debug calls. Many hits are false positives (`UTF-8` matches the Jira pattern, for example). Review each one and tell D which ones look real. Anything that looks like a credential or a client reference blocks the push until he decides.
2. Read `git -C ~/apps/drupal-contrib/<module> diff --cached` yourself. Look for things the regex can't catch, such as hardcoded site-specific content types, field names, or config that only makes sense on the Riva site. Those belong in a site-specific glue module, not in the contrib module.
3. If the module has PHP changes and `phpcs` with the Drupal standard is available, run `phpcs --standard=Drupal,DrupalPractice` on the changed files and report issues. Don't install tooling without asking.

### 4. Commit

Draft a commit message from the actual diff. Use the imperative mood and describe what changed for a module user, not how it was synced. When the change relates to a drupal.org issue, use the long-standing contrib format `Issue #<nid> by <username>: <summary>`. D's drupal.org username is `the-letter-d`. Ask for the issue number rather than guessing one, and if there isn't an issue, a plain summary line is fine.

Commit with the git identity already configured in the clone. If `user.email` is unset there, ask D which address to use, since drupal.org credits commits by the email linked to the account.

Show D the message and the `--stat` summary.

### 5. Push after confirmation

Ask D explicitly before pushing, showing the branch, the commit summary, and the remote. Only push after a clear yes in this conversation. Then:

```bash
git -C ~/apps/drupal-contrib/<module> push origin <branch>
$SYNC record <module>
```

`record` saves the pushed HEAD so the next preflight can detect upstream drift. Always run it after a successful push. If the push fails, report the error and don't record.

## Pulling upstream changes back

Use this when preflight reports `WOULD_OVERWRITE` or `WOULD_DELETE`, or when D asks to bring drupal.org changes into the site.

1. For each flagged file, run `$SYNC pullback <module> <file>` (dry run) and show D the diff. Lines with `-` exist only in the custom copy, lines with `+` only upstream.
2. If the custom copy has no local edits to that file, `$SYNC pullback <module> <file> --apply` is safe.
3. If both sides changed the file, don't overwrite either. Merge by hand in the custom copy, show D the merged result, and get his approval.
4. Upstream deletions (`WOULD_DELETE`) mean the file exists in the custom copy but not in the clone, or was removed upstream. Ask D before deleting anything in the site repo; pullback never deletes.
5. When everything is reconciled, run preflight again. If the clone needs no new commit, run `$SYNC record <module>` so the drift warning clears.

Remind D that pulled-back changes are now uncommitted in the site repo and need a normal site commit.

## Tagging a release (only on request)

1. Make sure the branch is pushed and preflight reports `UPSTREAM_CLEAN`.
2. Propose a version. Drupal.org uses semantic versioning tied to the branch. On `1.0.x`, tags look like `1.0.0`, `1.0.1`, or pre-releases such as `1.0.0-alpha1`, `1.0.0-beta2`, `1.0.0-rc1`. The tag must match the branch's major and minor numbers. Check existing tags with `git tag --list` and suggest the next one; bump the patch number for fixes, and suggest a new minor branch (for example `1.1.x`) if the changes add features or break compatibility.
3. List commits since the last tag (`git log <last-tag>..HEAD --oneline`) as draft release notes.
4. After D confirms the version, create and push the tag:

```bash
git -C ~/apps/drupal-contrib/<module> tag <version>
git -C ~/apps/drupal-contrib/<module> push origin <version>
```

5. Tell D that pushing the tag doesn't publish the release. He still needs to create the release on the project page at `https://www.drupal.org/project/<module>`, select the tag, and paste in the release notes you drafted.

## Configuration

Per-module settings live in `~/apps/drupal-contrib/.sync-state/` and are optional:

- `<module>.exclude` lists extra rsync exclude patterns, one per line, for files that exist only in the drupal.org repo or only in the site copy. Defaults already exclude `.git`, `.gitlab-ci.yml`, `.gitlab/`, `.DS_Store`, `node_modules/`, `.idea/`, and `.vscode/`.
- `<module>.leak-patterns` lists extra extended regexes for leakcheck, one per line.
- `<module>.last` is written by `record`. Don't edit it by hand.

Set `DRUPAL_CONTRIB_ROOT` to use a location other than `~/apps/drupal-contrib`, or `SITE_MODULE_PATH` when the module isn't under `web/`, `docroot/`, or the repo root's `modules/custom/`.

The script needs `rsync` and `git`. It was tested with GNU rsync 3.x. If macOS's bundled rsync rejects a flag, suggest `brew install rsync`.

---

## Drupal.org Application Review Workflow

Use this section when D receives "Needs work" feedback on a project application issue (e.g. `https://www.drupal.org/project/projectapplications/issues/<nid>`). This workflow documents lessons learned from reviewing `content_syndication` application issue #3629501.

### Who Reviews and What They Check

Drupal.org project applications get two types of feedback:

**Code reviewers (e.g. ptmkenny)** check:
- Documentation quality and AI disclosure requirements
- PHPStan baseline — stale or overly-broad ignores (especially `undefined property` / `undefined method`)
- README.md following the Drupal.org template format
- Exception hierarchy (base exception class)
- Spelling config (`cspell`) — use `~word` for domain terms
- Form validation completeness
- Test docblock style ("Tests that ..." format)
- SETUP_GUIDE simplicity (minimum install command, dependencies implicit)

**Process reviewers (e.g. avpaderno)** check:
- GitLab CI enabled (`.gitlab-ci.yml` present and using `project/gitlab_templates`)
- PHPCS passing with Drupal coding standards
- LICENSE.txt matching Drupal core exactly (GPL v2, 18002 bytes)
- Only the applicant's commits during the open application window

### Monitoring CI Pipelines via Drupal.org API

Use a GitLab PAT stored in the session. The project slug is `project%2F<module_name>`.

```bash
PAT="<gitlab-pat>"

# List latest pipelines
curl -s -H "PRIVATE-TOKEN: $PAT" \
  "https://git.drupalcode.org/api/v4/projects/project%2F<module>/pipelines?ref=<branch>&per_page=3&order_by=updated_at"

# Get jobs for a pipeline
PIPEID=<id>
curl -s -H "PRIVATE-TOKEN: $PAT" \
  "https://git.drupalcode.org/api/v4/projects/project%2F<module>/pipelines/$PIPEID/jobs" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for j in data:
    s = '✅' if j['status'] == 'success' else '❌' if j['status'] == 'failed' else '⏳'
    print(f'{s} {j[\"name\"]}')
"

# Get job trace (log output)
JOBID=<id>
curl -s -H "PRIVATE-TOKEN: $PAT" \
  "https://git.drupalcode.org/api/v4/projects/project%2F<module>/jobs/$JOBID/trace"

# Download CI-generated artifact (e.g. phpstan-baseline.neon)
curl -s -H "PRIVATE-TOKEN: $PAT" -L \
  "https://git.drupalcode.org/api/v4/projects/project%2F<module>/jobs/$JOBID/artifacts/phpstan-baseline.neon" \
  -o /tmp/ci-baseline.neon
```

The PAT for `git.drupalcode.org` is stored in `~/.gitconfig` or can be recalled from Qdrant memory for the `drupal-contrib` project.

### Fixing PHPStan Baseline Stale Entries

The Drupal.org CI PHPStan job runs `composer install` (which installs ALL `require` AND `require-dev` packages), so all packages are resolved. The baseline must match exactly what CI sees.

**Symptom:** PHPStan job fails with `was not matched in reported errors` — the baseline has entries that CI no longer generates.

**Fix:**
1. Get the PHPStan job ID from the failed pipeline
2. Download the CI-generated baseline: `curl … /artifacts/phpstan-baseline.neon -o /tmp/ci-baseline.neon`
3. Copy it to the module: `cp /tmp/ci-baseline.neon ~/apps/drupal-contrib/<module>/phpstan-baseline.neon`
4. Commit and push

**Note:** If the baseline needs to be ZERO entries (reviewer requested fixing all errors), add `instanceof` type narrowing guards instead of ignoring errors. The only acceptable remaining baseline entry is `new.static` in plugin base classes (Drupal-specific pattern).

### Making Optional Module Dependencies Truly Optional

When a module has an optional dependency (e.g. `drupal/ai`) that should not block installation:

**1. In `composer.json`** — Move from `require` to `require-dev`:
```json
"require-dev": {
  "drupal/ai": "^1.0"
}
```

**2. In `<module>.info.yml`** — Remove from `dependencies` array:
```yaml
# Remove this:
dependencies:
  - ai:ai
```

**3. In `<module>.services.yml`** — Make service arguments optional with `@?`:
```yaml
content_syndication.transformer:
  class: Drupal\content_syndication\Service\SyndicationTransformerService
  arguments:
    - '@?ai.provider'       # @? makes it optional — null if service doesn't exist
    - '@logger.channel.content_syndication'
```

**Why:** Without `@?`, a `ServiceNotFoundException` is thrown during module installation in PHPUnit functional tests when the optional module isn't present. This causes all functional tests to `Error` (0 assertions) rather than pass.

### Fixing EntityInterface PHPStan Errors with instanceof Guards

The reviewer will ask to stop ignoring `undefined property` and `undefined method` errors and fix them properly.

**Root cause:** `EntityTypeManagerInterface::getStorage()->load()` returns `EntityInterface|null`. PHPStan cannot infer the concrete entity type (`SyndicationJob`, `SyndicationAccount`, etc.) from the storage name alone.

**Fix pattern:**
```php
// BEFORE (triggers PHPStan error):
$job = $storage->load($job_id);
if (!$job) { return; }
$job->get('status')->value; // EntityInterface has no get() method

// AFTER (type-narrowed):
use Drupal\mymodule\Entity\MyEntity;

$job = $storage->load($job_id);
if (!$job instanceof MyEntity) { return; }
$job->get('status')->value; // OK — MyEntity extends ContentEntityBase which has get()
```

**For `array_filter()` results** — PHPStan does not narrow the return type of `array_filter()` even with a type-check callback. Add an `instanceof` guard at the top of the `foreach` loop:
```php
foreach ($accounts as $account) {
  if (!$account instanceof SyndicationAccount) {
    continue;
  }
  // Now $account is SyndicationAccount — direct property access is safe
  $platform_id = $account->platform;
}
```

**AGENTS.md rule** — After fixing, add to AGENTS.md:
> Always add `instanceof MyEntity` guards after loading entities from storage. PHPStan level 2 rejects direct property/method access without a narrowing check.

### Drafting a Reply Comment for the Issue

After addressing all feedback, draft a structured comment for the application issue covering:

1. **State CI status first** — "All 6 CI jobs passing on pipeline <id>"
2. **Address each reviewer's points in order** — ptmkenny first, then avpaderno
3. **Link to commits** — Use the full 7-char SHA and a short description
4. **State readiness** — "Ready to set back to Needs review"

Template:
```
All review feedback from <reviewer> (code review, <date>) and <reviewer> (process guidance, <date>) has been addressed. **GitLab CI pipeline <id> passed all 6 jobs.**

### <reviewer1>'s Code Review — Resolved

✅ **<item>** — <one-line explanation of what was changed>
...

### <reviewer2>'s Guidance — Resolved

✅ **<item>** — <one-line explanation>
...

Commits: `<sha1>`, `<sha2>` pushed to `origin/<branch>`

Ready to set issue back to **"Needs review"**.
```

### Common Reviewer Requirements Checklist

Before submitting or re-submitting for review, verify all of:

- [ ] `AGENTS.md` — AI use disclosure in the repo
- [ ] Drupal.org project page description — AI use disclosure paragraph
- [ ] `README.md` — Follows Drupal.org template (Introduction, Requirements, Installation, Configuration)
- [ ] `SETUP_GUIDE.md` (if present) — Single `drush en <module>` command; no manual dependency listing
- [ ] `.gitlab-ci.yml` — Present and using `project/gitlab_templates` with `main` ref
- [ ] `LICENSE.txt` — GPL v2, matches Drupal core (18002 bytes)
- [ ] `composer.json` — Optional deps in `require-dev`, not `require`
- [ ] `<module>.info.yml` — Only hard dependencies listed; optional modules removed
- [ ] `<module>.services.yml` — Optional service args use `@?` prefix
- [ ] `phpstan-baseline.neon` — No stale entries; no `class.notFound` for installed packages; no `undefined property/method` entries (fix with instanceof instead)
- [ ] `<module>.cspell.json` — Domain terms use `~word` format (single entry)
- [ ] Exception hierarchy — Base exception class exists; specific exceptions extend it
- [ ] Form validation — `validateForm()` implemented on all forms
- [ ] Test docblocks — All test methods use "Tests that ..." format
- [ ] Only applicant commits — No bot, CI, or co-author commits during open application
- [ ] CI passing — All 6 jobs green before re-submitting for review
