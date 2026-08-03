---
name: jira-manager
description: This skill should be used when managing JIRA tickets programmatically, including creating issues, updating fields, adding comments, linking tickets, transitioning workflows, and querying JIRA instances. Supports both Jira Cloud and Jira Server/Data Center with PAT (Personal Access Token) Bearer authentication. Uses stdlib-only urllib for maximum compatibility.
---

# JIRA Manager Skill (v3.0 - CLI-First)

## Purpose

Enable programmatic management of JIRA tickets and projects through a **CLI-first, reusable script pattern**. This skill provides a standardized command-line interface for common JIRA operations including ticket creation, updates, comments, linking, workflow transitions, and bulk operations. **No external dependencies required — stdlib urllib only.**

## Critical Updates (v3.0)

### Architecture Changes from v2.0
- **CLI-First Pattern** — All operations callable via `python3 jira_client.py <command>` — no inline Python generation
- **Reusable Scripts** — `jira_client.py` is the canonical implementation; SKILL.md references it, never duplicates
- **Template System** — Pre-filled issue templates with `${ENV_VAR}` substitution eliminate boilerplate
- **Centralized Config** — `jira_config.py` handles .env loading, SSL context, and header construction
- **Zero Boilerplate** — AI calls the CLI; no 40+ line inline Python scripts needed
- **Stdlib-Only** — Removed `requests` dependency; uses `urllib` throughout (consistent with SKILL.md intent)

### Environment Variables (Updated)

```bash
# .env file
JIRA_INSTANCE_URL=https://cmext.ahrq.gov/jira
JIRA_PAT=<your-personal-access-token>
JIRA_PROJECT_KEY=AQD
```

**Note:** `JIRA_PAT` is a Personal Access Token, not an API token. Generate via JIRA → Profile → Personal Access Tokens.

## When to Use This Skill

Use this skill when:
- Creating JIRA tickets from investigation reports or incident documentation
- Updating existing tickets with new information or status changes
- Adding comments or attachments to track progress
- Linking related tickets or documentation
- Transitioning tickets through workflow states (e.g., Open → In Progress → Done)
- Querying JIRA for issues, projects, or custom field data
- Performing bulk operations on multiple tickets
- Integrating JIRA with other tools or processes
- Working with **Jira Server/Data Center** instances (not Cloud)

## How to Use This Skill

### Step 1: Pre-Flight Check

Always verify JIRA connectivity before attempting operations:

```bash
python3 skills/jira-manager/scripts/jira_client.py check
```

Output:
```
✅ JIRA connectivity OK
Instance: https://cmext.ahrq.gov/jira
Project: AQD
```

### Step 2: Create Issues

#### Option A: From Command-Line Arguments

```bash
python3 skills/jira-manager/scripts/jira_client.py create \
  --type Bug \
  --summary "Database connection pool exhaustion" \
  --description "Connection pool exhausted during traffic spike" \
  --priority High
```

#### Option B: From Template (Recommended)

```bash
python3 skills/jira-manager/scripts/jira_client.py create \
  --template skills/jira-manager/templates/bug.json \
  --summary "Database connection pool exhaustion" \
  --description "Connection pool exhausted during traffic spike" \
  --priority High
```

Available templates:
- `templates/bug.json` — Bug issues (default priority: High)
- `templates/task.json` — Task issues (default priority: Medium)
- `templates/story.json` — Story issues (default priority: Medium)
- `templates/epic.json` — Epic issues (default priority: High)

### Step 3: Get Issue Details

```bash
python3 skills/jira-manager/scripts/jira_client.py get AQD-123
```

Output:
```
Key: AQD-123
Summary: Database connection pool exhaustion
Status: Open
Priority: High
Assignee: Unassigned
```

### Step 4: Update Issues

```bash
python3 skills/jira-manager/scripts/jira_client.py update AQD-123 \
  --priority Critical \
  --summary "Updated summary"
```

### Step 5: Add Comments

#### Plain Text Comment

```bash
python3 skills/jira-manager/scripts/jira_client.py comment AQD-123 \
  --body "Investigation complete. Root cause identified: DEXI API integration inefficiency."
```

#### Comment with JIRA Markup (Recommended)

Always use JIRA markup for structured comments:

```bash
python3 skills/jira-manager/scripts/jira_client.py comment AQD-123 \
  --body "h2. Investigation Complete

h3. Root Cause
* DEXI API integration inefficiency
* Connection pool exhaustion

h3. Impact
* 50% performance degradation
* User-facing latency

h3. Resolution
* Implemented connection pooling optimization
* Added circuit breaker pattern

||Metric||Before||After||
|Response Time|1224ms|200ms|
|RPS|8.17|50+|"
```

#### JIRA Markup Reference

Use these formatting options in comment bodies:

**Headings:**
- `h1. Heading 1`
- `h2. Heading 2`
- `h3. Heading 3`
- `h4. Heading 4`

**Lists:**
- `* Bullet point`
- `** Nested bullet`
- `# Numbered item`
- `## Nested numbered`

**Tables:**
```
||Header 1||Header 2||Header 3||
|Cell 1|Cell 2|Cell 3|
|Cell 4|Cell 5|Cell 6|
```

**Text Formatting:**
- `*bold*` → **bold**
- `_italic_` → _italic_
- `??citation??` → citation
- `-strikethrough-` → ~~strikethrough~~
- `+inserted+` → inserted
- `^superscript^` → superscript
- `~subscript~` → subscript

**Code:**
- `{{monospace}}` → monospace
- `{code}code block{code}` → code block
- `{code:language=python}...{code}` → syntax highlighted

**Links:**
- `[Link Text|https://example.com]`
- `[EHCD-3201]` → link to issue
- `[~username]` → mention user

**Example with All Formatting:**

```bash
python3 skills/jira-manager/scripts/jira_client.py comment EHCD-3201 \
  --body "h2. Performance Optimization Complete ✅

h3. Implementation Summary

h4. P0 Fixes (Critical) ✅
* Enable page caching globally
* Remove duplicate redis.so extension

h4. P1 OPcache Tuning (Core) ✅
* Add opcache-recommended.ini with 9 parameters
* Add Xdebug build-time assertion

h3. Verification Results

h4. Puppeteer Tests ✅
* Test 1: Page Cache Enabled - PASSED
** First request: HIT
** Second request: HIT

h4. Apache Bench (100 requests, 10 concurrent) ✅
* Cache-Control: max-age=86400, public
* X-Drupal-Cache: HIT
* 0 Failed Requests

h3. Performance Impact

||Metric||Before||After||
|Page Cache Status|DISABLED|HIT (ENABLED)|
|Cache-Control|None|max-age=86400, public|
|Expected RPS|8.17|50-100+|
|Expected Response Time|1224ms|<200ms (cached)|

h3. Next Steps

# Code review of PR #98
# Run full test suite in staging
# Merge to develop
# Deploy to production

See [EHCD-3201] for details."
```


### Step 6: List Available Transitions

```bash
python3 skills/jira-manager/scripts/jira_client.py transitions AQD-123
```

Output:
```
Available transitions for AQD-123:
  - Start Progress (ID: 11)
  - Resolve (ID: 5)
  - Close (ID: 10)
```

### Step 7: Transition Issues

```bash
python3 skills/jira-manager/scripts/jira_client.py transition AQD-123 \
  --to "In Progress"
```

With optional comment:

```bash
python3 skills/jira-manager/scripts/jira_client.py transition AQD-123 \
  --to "In Progress" \
  --comment "Starting investigation"
```

### Step 8: Search for Issues

```bash
python3 skills/jira-manager/scripts/jira_client.py search \
  --jql 'project = AQD AND status = "Open" AND priority = "High"' \
  --max 20
```

See [`references/jql-patterns.md`](references/jql-patterns.md) for common JQL query patterns.

### Step 9: Link Issues

```bash
python3 skills/jira-manager/scripts/jira_client.py link AQD-123 AQD-456 \
  --type "relates to"
```

## Complete Workflow Example

```bash
# Step 1: Verify connectivity
python3 skills/jira-manager/scripts/jira_client.py check

# Step 2: Create ticket from template
python3 skills/jira-manager/scripts/jira_client.py create \
  --template skills/jira-manager/templates/bug.json \
  --summary "Database connection pool exhaustion" \
  --description "Connection pool exhausted during traffic spike" \
  --priority High

# Step 3: Add investigation comment
python3 skills/jira-manager/scripts/jira_client.py comment AQD-9999 \
  --body "Root cause: DEXI API integration inefficiency"

# Step 4: Transition to In Progress
python3 skills/jira-manager/scripts/jira_client.py transition AQD-9999 \
  --to "In Progress"

# Step 5: Link to related issue
python3 skills/jira-manager/scripts/jira_client.py link AQD-9999 AQD-8888 \
  --type "relates to"
```

## Configuration

### Required Environment Variables

```bash
# .env file (in project root)
JIRA_INSTANCE_URL=https://cmext.ahrq.gov/jira
JIRA_PAT=<your-personal-access-token>
JIRA_PROJECT_KEY=AQD
```

### Installation

No external dependencies required! Only stdlib modules:
- `urllib.request` — HTTP requests
- `json` — JSON parsing
- `ssl` — SSL context management
- `os` — Environment variables
- `argparse` — CLI argument parsing

### File Structure

```
skills/jira-manager/
├── SKILL.md                    # This file
├── scripts/
│   ├── jira_client.py          # Main CLI (stdlib urllib + argparse)
│   └── jira_config.py          # Config management + .env loader
├── templates/
│   ├── bug.json                # Bug issue template
│   ├── task.json               # Task issue template
│   ├── story.json              # Story issue template
│   └── epic.json               # Epic issue template
└── references/
    ├── jql-patterns.md         # Common JQL query patterns
    ├── custom-fields.md        # Custom field ID mapping
    └── workflow-states.md      # Workflow transitions reference
```

## CLI Reference

### Global Options

All commands require `.env` file with `JIRA_INSTANCE_URL`, `JIRA_PAT`, `JIRA_PROJECT_KEY`.

### Commands

#### `check`
Verify JIRA connectivity and configuration.

```bash
python3 jira_client.py check
```

#### `create`
Create a new JIRA issue.

```bash
python3 jira_client.py create \
  --type Bug \
  --template templates/bug.json \
  --summary "Issue summary" \
  --description "Issue description" \
  --priority High \
  --assignee user@example.com \
  --labels "label1,label2" \
  --json
```

Options:
- `--type` — Issue type (default: Task)
- `--template` — Path to template JSON file
- `--summary` — Issue summary (required if no template)
- `--description` — Issue description
- `--priority` — Priority (High, Medium, Low)
- `--assignee` — Assignee email
- `--labels` — Comma-separated labels
- `--story-points` — Story Points value (auto-discovers field ID on this JIRA instance)
- `--original-estimate` — Original Estimate in seconds (auto-discovers field ID; 3600 = 1 hour, 28800 = 8 hours, 86400 = 1 day)
- `--json` — Output JSON response

#### Create with Story Points and Original Estimate

```bash
python3 jira_client.py create \
  --type Story \
  --summary "User authentication flow" \
  --description "Implement OAuth 2.0" \
  --story-points 13
```

**Field Auto-Discovery:**

Story Points and Original Estimate fields are auto-discovered by querying the JIRA instance's `/field` endpoint. This means:
- Works with any JIRA instance (Cloud, Server, Data Center)
- Automatically finds the correct custom field ID for your instance
- Results are cached to avoid repeated API calls
- If a field is not configured on the issue screen, you'll get a validation error

**Testing with CLOUD Project:**

```bash
# Create with Story Points
python3 jira_client.py --project CLOUD create \
  --type Task \
  --summary "Sprint task" \
  --story-points 8

# Update Story Points
python3 jira_client.py --project CLOUD update CLOUD-123 \
  --story-points 13

# Verify Story Points on existing issue
python3 jira_client.py --project CLOUD update CLOUD-2000 --story-points 5
python3 jira_client.py --project CLOUD get CLOUD-2000 --json | grep customfield_10106
# Output: "customfield_10106": 5.0
```

**Field Availability (CLOUD Project Verified):**

| Field | Status | Notes |
|---|---|---|
| Story Points | ✅ WORKING | Fully functional - auto-discovers to `customfield_10106` |
| Original Estimate | ⚠️ NOT SETTABLE | Visible in UI but REST API v2 cannot set it (JIRA configuration issue) |

**If a field is not available:**
```
❌ Validation error: {'fieldname': "Field 'fieldname' cannot be set. It is not on the appropriate screen, or unknown."}
```

**Solution:** Contact your JIRA administrator to configure the field for REST API access in Project Settings → Issue Types → Screens.

**Real-World Testing Results (CLOUD Project):**
- ✅ Created multiple issues with Story Points (5, 8, 13, 21)
- ✅ Updated Story Points on existing issues (CLOUD-2000, CLOUD-2007, CLOUD-2008, etc.)
- ✅ Values persist correctly in JIRA
- ✅ Field auto-discovery caching works

#### `get`
Get issue details.

```bash
python3 jira_client.py get AQD-123 --json
```

#### `update`
Update an existing issue.

```bash
python3 jira_client.py update AQD-123 \
  --summary "New summary" \
  --priority Critical
```

**Update with Story Points and Original Estimate:**

```bash
python3 jira_client.py update AQD-123 \
  --story-points 8 \
  --original-estimate 86400
```

Options:
- `--summary` — New summary
- `--description` — New description
- `--priority` — New priority
- `--assignee` — New assignee email
- `--labels` — Comma-separated labels
- `--story-points` — Story Points value (auto-discovers field ID)
- `--original-estimate` — Original Estimate in seconds (auto-discovers field ID)

#### `comment`
Add comment to issue.

```bash
python3 jira_client.py comment AQD-123 --body "Comment text"
```

#### `transitions`
List available transitions for an issue.

```bash
python3 jira_client.py transitions AQD-123
```

#### `transition`
Transition issue to new state.

```bash
python3 jira_client.py transition AQD-123 \
  --to "In Progress" \
  --comment "Starting work"
```

#### `search`
Search for issues using JQL.

```bash
python3 jira_client.py search \
  --jql 'project = AQD AND status = "Open"' \
  --max 50 \
  --json
```

#### `link`
Link two issues using custom fields (Epic Link, Parent Link, Initiative Link).

```bash
python3 jira_client.py link AQD-123 AQD-456 --type epic
```

Available link types:
- `epic` — Link to Epic (customfield_10100)
- `parent` — Link to Parent (customfield_10901)
- `initiative` — Link to Initiative (customfield_11022)

**Note:** Link fields must be configured on issue screens in JIRA Project Settings.

#### `release-notes`
Generate release notes from JIRA issues by fixVersion, label, or epic.

```bash
python3 jira_client.py release-notes \
  --version "Deployment 202604.01" \
  --strategy fixversion \
  --output release_notes.md
```

Options:
- `--version` — Release version to search for (required)
- `--strategy` — Search strategy: `fixversion` (default), `label`, `epic`, `project`
- `--output` — Output file path (default: stdout)
- `--json` — Output JSON instead of Markdown

Search strategies:
- `fixversion` — Search by JIRA fixVersion field
- `label` — Search by label (e.g., `release-<version>`)
- `epic` — Search by epic link
- `project` — Search by project and label

Example output:
```markdown
## Release Deployment 202604.01

### Features
- [EHCD-3293](https://cmext.ahrq.gov/jira/browse/EHCD-3293): Implement GitHub Release automation

### Bug Fixes
- [EHCD-3084](https://cmext.ahrq.gov/jira/browse/EHCD-3084): Search pages not cached

**Total Issues:** 31
**Release Date:** 2026-05-18
```

## Error Handling

The CLI provides clear, actionable error messages:

```bash
# Authentication error
❌ Authentication failed. Check JIRA_PAT.

# Resource not found
❌ Resource not found: /issue/INVALID-999

# Validation error
❌ Validation error: {'summary': 'Summary is required'}

# Transition not found
❌ Transition 'Invalid State' not found.
Available: Start Progress, Resolve, Close
```

## Custom Field Auto-Discovery

The `create` and `update` commands support **automatic field ID discovery** for Story Points and Original Estimate:

### How It Works

When you use `--story-points` or `--original-estimate`, the CLI:
1. Queries the `/field` endpoint to get all available fields
2. Searches by field name (case-insensitive)
3. Caches the result to avoid repeated API calls
4. Uses the discovered field ID for the create/update operation

### Supported Fields

| Field Name | Built-in ID | Discovery | Notes |
|---|---|---|---|
| Story Points | `customfield_10106` | Auto-discovered | Usually available on most instances |
| Original Estimate | `timeoriginalestimate` | Auto-discovered | May require JIRA admin to enable on issue screens |

### Example

```bash
# Auto-discovers Story Points field for your JIRA instance
python3 jira_client.py --project CLOUD create \
  --type Task \
  --summary "Sprint task" \
  --story-points 8
```

The first call discovers the field ID; subsequent calls use the cached result.

### Troubleshooting Auto-Discovery

If you see:
```
❌ Validation error: {'fieldname': "Field 'fieldname' cannot be set. It is not on the appropriate screen..."}
```

The field exists but is not configured on the issue screen. Contact your JIRA administrator to:
1. Go to Project Settings → Issue Types → Screens
2. Add the field to the appropriate screens
3. Try again

## References

- **JQL Patterns:** [`references/jql-patterns.md`](references/jql-patterns.md) — Common query patterns
- **Custom Fields:** [`references/custom-fields.md`](references/custom-fields.md) — Field ID mapping
- **Workflow States:** [`references/workflow-states.md`](references/workflow-states.md) — Transitions reference

## Limitations and Notes

- **API Rate Limits:** Jira Server/Data Center typically has higher limits than Cloud (check your instance)
- **SSL Verification:** Disabled for internal instances — uses `ssl.CERT_NONE` for self-signed certs
- **Workflow Transitions:** Depend on project configuration — use `transitions` command to discover available transitions
- **Custom Fields:** Field IDs vary by instance — use `references/custom-fields.md` to discover your instance's IDs
- **Permissions:** Some operations require specific JIRA permissions — ensure PAT has necessary scopes
- **Bulk Operations:** For bulk updates, use `search` to find issues, then loop through results

## Troubleshooting

### SSL Certificate Verification Failed
**Solution:** Ensure `ssl.CERT_NONE` is set in `jira_config.py` for internal instances.

### 401 Unauthorized
**Solution:** Verify `JIRA_PAT` is correct and has not expired. Generate a new token if needed.

### 404 Not Found
**Solution:** Verify `JIRA_INSTANCE_URL` is correct and endpoint path matches REST API v2 format.

### Transition Not Found
**Solution:** Use `transitions` command to see available transitions. Check exact spelling and capitalization.

### Connection Error
**Solution:** Verify JIRA instance is accessible. Check firewall rules and network connectivity.

## Design Principles

This skill follows these principles:

1. **CLI-First** — Every operation callable via terminal; no wrapper scripts needed
2. **Reusable** — `jira_client.py` is the canonical implementation; SKILL.md references it
3. **Stdlib-Only** — No external dependencies; uses `urllib` throughout
4. **Zero-Boilerplate** — Templates and config eliminate repetitive setup
5. **Composable** — Unix philosophy; operations pipe together
6. **Discoverable** — Help text and references guide users to correct usage

## Version History

- **v4.3** (2026-08-03) — Story Points & Original Estimate support with auto-discovery. Uses `/field` endpoint to discover custom field IDs, works with any JIRA instance (Cloud, Server, Data Center). Tested with CLOUD project.
- **v4.0-4.2** — Hardened CLI with pre-flight gates, file attachments, issue linking
- **v3.0** (2026-04-29) — CLI-first architecture, templates, centralized config
- **v2.0** — Stdlib urllib, Bearer auth, Server/Data Center support
- **v1.0** — Initial release with requests library
