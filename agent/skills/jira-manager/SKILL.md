---
name: jira-manager
description: This skill should be used when managing JIRA tickets programmatically, including creating issues, updating fields, adding comments, linking tickets, transitioning workflows, and querying JIRA instances. Supports both Jira Cloud and Jira Server/Data Center with PAT (Personal Access Token) Bearer authentication. Uses stdlib-only urllib for maximum compatibility.
---

# JIRA Manager Skill (v4.0 - CLI-First, Hardened)

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

### Hardening Changes from v3.0 (v4.0)
- **Mandatory Pre-Flight Gate** — `check` is now a blocking gate; all write operations MUST be preceded by a successful `check`
- **CLI-Only Enforcement** — Explicit FORBIDDEN constraint against generating inline scripts that duplicate `jira_client.py`
- **Credential Hygiene** — PAT detection guard added; agent must never write `JIRA_PAT = "..."` into source files
- **comment-First Policy** — `comment` is the default operation for status updates; `update` (description PUT) requires explicit justification
- **Jira Markup Enforcement** — Markdown syntax (`##`, `**`, `---`) is forbidden in `--body` arguments; Jira Wiki Markup required
- **Invocation Checklist** — Mandatory 5-step checklist added at top of skill
- **File Attachment Requirement** — All tickets with specifications, ADRs, or runbooks MUST have files attached to JIRA (not just local `.ai-memory/` references)

### Environment Variables (Updated)

```bash
# .env file
JIRA_INSTANCE_URL=https://your-jira-instance.example.com/jira
JIRA_PAT=<your-personal-access-token>
JIRA_PROJECT_KEY=CLOUD
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

---

## ⚠️ AGENT CONSTRAINTS (Read Before Any Operation)

### CONSTRAINT 1 — CLI-First (FORBIDDEN: Inline Scripts)

> **FORBIDDEN:** Writing one-off Python scripts that duplicate `jira_client.py` functionality.
>
> If you are about to create a file containing `urllib.request` + any JIRA API call, **STOP**. Use the canonical CLI instead.

**Violation pattern to detect and block:**
```python
# ❌ NEVER generate files like this
import urllib.request
JIRA_PAT = "..."          # credential leak
description = "## Heading"  # Markdown, not Jira markup
urllib.request.urlopen(...)
```

**Correct pattern:**
```bash
# ✅ Always invoke the canonical CLI via the installed shim
jira --project ADO comment ADO-241 --body "h2. Status Update..."

# Or with project key from caller's .env:
jira comment ADO-241 --body "h2. Status Update..."
```

---

### CONSTRAINT 2 — Credential Hygiene (FORBIDDEN: Hardcoded PAT)

> **FORBIDDEN:** Writing any file that contains a string matching `JIRA_PAT\s*=\s*["'][A-Za-z0-9+/=]{20,}`.
>
> If you detect you are about to write a hardcoded PAT into source code, **STOP** and redirect to `.env` loading via `jira_config.py`.

**Correct credential pattern:**
```bash
# .env file (never committed — add to .gitignore)
JIRA_PAT=<your-personal-access-token>
```

`jira_config.py` reads this automatically. You never need to pass the PAT as a CLI argument or embed it in code.

**If a PAT has been committed to git history:**
1. Delete the offending file immediately
2. Rotate the PAT via JIRA → Profile → Personal Access Tokens
3. Force-push or use `git filter-repo` to scrub history

---

### CONSTRAINT 3 — Jira Wiki Markup Only (FORBIDDEN: Markdown in --body)

> **FORBIDDEN:** Passing Markdown syntax (`##`, `**`, `---`, `_text_`) in `--body` arguments.
>
> Jira Server/Data Center REST API v2 renders Markdown as literal characters. Use Jira Wiki Markup.

| Markdown (❌ Wrong) | Jira Wiki Markup (✅ Correct) |
|---|---|
| `## Heading` | `h2. Heading` |
| `**bold**` | `*bold*` |
| `_italic_` | `_italic_` |
| `- bullet` | `* bullet` |
| `---` | `----` |
| ` ```code``` ` | `{code}code{code}` |

**Pre-send validation:** Before constructing a `--body` argument, scan for `##`, `**`, or ` ``` ` patterns. If found, convert to Jira Wiki Markup equivalents above.

---

### CONSTRAINT 4 — comment > update (Prefer Additive Over Destructive)

> **Default operation for status updates: `comment`**
>
> `update` (PUT to description field) **overwrites** the entire description. Use it only when the description itself must change.
> `comment` is **additive** — it appends to ticket history and preserves all prior content.

| Operation | Effect | When to Use |
|---|---|---|
| `comment` | Additive — appends to history | ✅ Status updates, progress notes, findings |
| `update` | Destructive — overwrites description | ⚠️ Only when description content must change |
| `transition` | State change | ✅ Moving ticket through workflow |

---

### CONSTRAINT 6 — File Attachment Requirement (MANDATORY for Specifications)

> **REQUIRED:** All tickets created with technical specifications, ADRs, runbooks, implementation plans, or security assessments MUST have the specification file attached to the JIRA ticket.
>
> Do NOT rely solely on `.ai-memory/` local file references. The specification must be attached to the ticket so it is discoverable in JIRA UI.

**When to attach:**
- Technical specifications (e.g., architecture designs, workflow implementations)
- Architecture Decision Records (ADRs)
- Deployment runbooks and operational guides
- Security assessments and incident reports
- Implementation plans and project proposals
- Any document >500 lines or critical for implementation

**How to attach (Python pattern):**

```python
import urllib.request
import json
import ssl

# Disable SSL verification for self-signed certs
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Load credentials from jira_config.py
from jira_config import JiraConfig
config = JiraConfig()

# Read file
with open('spec.md', 'rb') as f:
    file_data = f.read()

# Prepare multipart form-data
boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
body = (
    f'--{boundary}\r\n'
    f'Content-Disposition: form-data; name="file"; filename="spec.md"\r\n'
    f'Content-Type: text/markdown\r\n\r\n'
).encode() + file_data + f'\r\n--{boundary}--\r\n'.encode()

# POST to attachment endpoint
url = f"{config.instance_url}/rest/api/2/issue/{ticket_key}/attachments"
req = urllib.request.Request(url, data=body)
req.add_header('Authorization', f'Bearer {config.pat}')
req.add_header('X-Atlassian-Token', 'no-check')
req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')

with urllib.request.urlopen(req, context=ssl_context) as response:
    result = json.loads(response.read())
    attachment_id = result[0]['id']
    print(f"✅ Attached: {attachment_id}")
```

**Verification after attachment:**
```bash
jira --project AQD get TICKET-KEY
# Output should show: Attachments: [filename] (ID: XXXXX)
```

**Reference:** [`.ai-memory/LESSONS-LEARNED-JIRA-ATTACHMENT.md`](../../../.ai-memory/LESSONS-LEARNED-JIRA-ATTACHMENT.md)

---

## ✅ Mandatory Invocation Checklist

Before **every** JIRA operation, verify all 7 gates:

```
[ ] 1. Pre-flight:   jira check  ← BLOCKING GATE (stop if fails)
[ ] 2. Credentials:  PAT loaded from .env — NEVER hardcoded in source files
[ ] 3. Format:       Body uses Jira Wiki Markup (h2., *, ||) — NOT Markdown (##, **)
[ ] 4. Operation:    comment (additive) preferred over update (destructive)
[ ] 5. Verify:       jira get <TICKET-ID> after every write
[ ] 6. Link ops:     Run 'jira link-types' before first 'jira link' call to verify type names
[ ] 7. Attachments:  If ticket contains specs/ADRs/runbooks, POST /attachments endpoint
```

---

## One-Time Setup (Per Machine)

Install the `jira` CLI shim to `~/.local/bin` so it is available from any repository:

```bash
# From the qdrant-memory-mcp project root:
make install-jira
```

This creates `~/.local/bin/jira` — a thin wrapper that delegates to [`jira_client.py`](scripts/jira_client.py). After installation, every project on the machine calls `jira` directly with no path hardcoding.

If `~/.local/bin` is not on your `PATH`, the installer will tell you exactly what to add to `~/.zshrc`.

**Verify installation:**
```bash
which jira          # → /Users/<you>/.local/bin/jira
jira --help
```

---

## How to Use This Skill

### Step 1: Pre-Flight Check (MANDATORY BLOCKING GATE)

**This step is not optional.** Run `check` before any write operation. If it fails, stop and surface the error — do not proceed.

```bash
# With project key from caller's .env:
jira check

# With explicit project key (no .env in caller's repo):
jira --project ADO check
```

**Success output:**
```
✅ JIRA connectivity OK
Instance: https://your-jira-instance.example.com/jira
Project: ADO
```

**Failure — stop and surface the error:**
```
❌ Authentication failed. Check JIRA_PAT.
→ ACTION: Verify .env contains valid JIRA_PAT. Rotate token if expired.

❌ Connection refused: https://your-jira-instance.example.com/jira
→ ACTION: Verify JIRA_INSTANCE_URL. Check network/VPN connectivity.

❌ Project 'XYZ' not found.
→ ACTION: Verify JIRA_PROJECT_KEY in .env or pass --project <KEY>.
```

**Do not proceed past Step 1 if `check` fails.**

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

#### Basic Usage

```bash
jira get AQD-123
```

Output:
```
Key: AQD-123
Summary: Database connection pool exhaustion
Status: Open
Priority: High
Assignee: Unassigned
Reporter: Unknown
```

#### Retrieve Full Ticket Context (Comments, Description, Attachments)

**Fetch all comments with automatic pagination:**
```bash
jira get AQD-9479 --include-comments --include-description
```

**Output includes:**
- Full ticket description
- All comments (auto-paginated)
- Author names and timestamps
- Comment preview (150 chars, truncation indicator if more exist)

**Fetch with attachment metadata:**
```bash
jira get AQD-9479 --include-comments --include-description --include-attachments
```

**Attachment output shows:**
- File icon (🖼️ for images, 📄 for docs, 📕 for PDFs, 🎥 for videos, etc.)
- Filename, size, MIME type, author, upload timestamp
- Download URL and thumbnail URL (for images)

#### Available Flags

| Flag | Effect | Default | Max |
|------|--------|---------|-----|
| `--include-description` | Include full issue description from API | off | — |
| `--include-comments` | Fetch and display all comments | off | — |
| `--include-attachments` | Include file metadata (URLs, sizes, MIME types) | off | — |
| `--comment-limit N` | Total comments to retrieve (auto-paginated) | 50 | 100 per-request, unlimited total |
| `--json` | Output raw JSON (includes `_comments`, `_description`, `_attachments` keys) | off | — |

#### Use Cases

**Infrastructure ticket investigation:**
```bash
jira get AQD-9479 --include-comments --include-description --json > ticket.json
# Extract all remediation notes and full context
```

**Root cause analysis:**
```bash
jira get ADO-337 --include-comments | grep -A 2 "warm pool"
# Search for specific decision rationale in comments
```

**Download screenshot from ticket:**
```bash
jira get AQD-9479 --include-attachments --json | jq -r '._attachments[0].download_url' | xargs curl -O
```

**List all images in ticket:**
```bash
jira get AQD-9479 --include-attachments --json | jq '._attachments[] | select(.mime_type | startswith("image/"))'
```

**Retrieve large number of comments:**
```bash
jira get AQD-9479 --include-comments --comment-limit 200
# Automatically paginated in batches of up to 100 per request
```

### Step 4: Update Issues

> ⚠️ **`update` overwrites the description field entirely.** For status updates and progress notes, use `comment` (Step 5) instead — it is additive and preserves ticket history.
>
> Use `update` only when the description content itself must be corrected or replaced.

```bash
python3 skills/jira-manager/scripts/jira_client.py update AQD-123 \
  --priority Critical \
  --summary "Updated summary"
```

### Step 5: Add Comments (Preferred for Status Updates)

> ✅ **`comment` is the preferred operation for status updates.** It appends to ticket history without overwriting any existing content.

#### Plain Text Comment

```bash
python3 skills/jira-manager/scripts/jira_client.py comment AQD-123 \
  --body "Investigation complete. Root cause identified: DEXI API integration inefficiency."
```

#### Comment with Jira Wiki Markup (Required for Structured Content)

Always use Jira Wiki Markup — **not Markdown** — for structured comments. Jira Server/Data Center API v2 does not render Markdown; `##`, `**`, and `---` will appear as literal characters.

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

#### Discover Available Link Types (Recommended First Step)

```bash
python3 skills/jira-manager/scripts/jira_client.py link-types
```

Output:
```
Available link types (8 total):
  Blocks
    → inward: is blocked by
    → outward: blocks
  Cloners
    → inward: is cloned by
    → outward: clones
  Duplicate
    → inward: is duplicated by
    → outward: duplicates
  Relates
    → inward: relates to
    → outward: relates to
```

#### Standard Relationship Links (via /issueLink endpoint)

```bash
# Link two issues with a standard relationship
python3 skills/jira-manager/scripts/jira_client.py link AQD-123 AQD-456 --type "blocks"
python3 skills/jira-manager/scripts/jira_client.py link AQD-123 AQD-456 --type "relates to"
python3 skills/jira-manager/scripts/jira_client.py link AQD-123 AQD-456 --type "duplicates"
```

Supported relationship types (call `jira link-types` to discover):
- `"relates to"` — General relationship
- `"blocks"` / `"is blocked by"` — Dependency
- `"clones"` / `"is cloned by"` — Cloning relationship
- `"duplicates"` / `"is duplicated by"` — Duplication
- And more (instance-specific)

#### Hierarchical Links (Epic / Parent)

```bash
# Link to epic (custom field)
python3 skills/jira-manager/scripts/jira_client.py link AQD-123 AQD-456 --type epic

# Link to parent (custom field)
python3 skills/jira-manager/scripts/jira_client.py link AQD-123 AQD-456 --type parent
```

**Note:** Hierarchical links require the custom fields to be configured on the issue screen. If you see `❌ Link field 'epic' not available on issue screen`, contact your JIRA admin to enable the field.

#### Verifying Links

After linking, verify the link was created:

```bash
python3 skills/jira-manager/scripts/jira_client.py get AQD-123

# Output now shows:
# ...
# Links:
#   blocks → AQD-456 (In Progress)
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

# Step 5: Discover link types before linking
python3 skills/jira-manager/scripts/jira_client.py link-types

# Step 6: Link to related issue
python3 skills/jira-manager/scripts/jira_client.py link AQD-9999 AQD-8888 \
  --type "relates to"

# Step 7: Verify link was created
python3 skills/jira-manager/scripts/jira_client.py get AQD-9999
```

## Configuration

### Required Environment Variables

```bash
# .env file (in project root)
JIRA_INSTANCE_URL=https://your-jira-instance.example.com/jira
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
- `--json` — Output JSON response

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

#### `fix-versions` (REST API — CLI does not support this)

`jira update` does **not** support `fixVersions`. Use the REST API directly via `jira_config.py` credentials.

**Remove a fixVersion:**
```python
python3 -c "
import sys, json, urllib.request, ssl
sys.path.insert(0, '/Users/dietrichgottfriedschmidt/qdrant-memory-mcp/agent/skills/jira-manager/scripts')
from jira_config import JiraConfig
c = JiraConfig()
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE
payload = json.dumps({'update': {'fixVersions': [{'remove': {'name': 'Deployment 202609.01'}}]}}).encode()
url = f'{c.instance_url}/rest/api/2/issue/EHCD-XXXX'
req = urllib.request.Request(url, data=payload, method='PUT')
req.add_header('Authorization', f'Bearer {c.pat}')
req.add_header('Content-Type', 'application/json')
with urllib.request.urlopen(req, context=ssl_ctx) as r:
    print(f'Status: {r.status}')  # 204 = success
"
```

**Add a fixVersion:**
```python
payload = json.dumps({'update': {'fixVersions': [{'add': {'name': 'Deployment 202609.02'}}]}}).encode()
```

**Replace all fixVersions (full set):**
```python
payload = json.dumps({'fields': {'fixVersions': [{'name': 'Deployment 202609.02'}]}}).encode()
```

> HTTP 204 = success (no response body). Use `jira get <TICKET>` to verify.

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
Link two issues with a relationship.

Supports both standard relationships (`/issueLink` endpoint) and hierarchical links (`/issue` custom fields).

```bash
# Standard relationship (via /issueLink)
python3 jira_client.py link AQD-123 AQD-456 --type "relates to"

# Hierarchical (via custom field)
python3 jira_client.py link AQD-123 AQD-456 --type epic
```

Options:
- `--type` — Relationship type (default: "relates to"). Run `jira link-types` to see available types on your instance.

**Tip:** Call `jira link-types` before linking to discover exact type names.

#### `link-types`
List all available issue link types on this JIRA instance.

```bash
python3 jira_client.py link-types
python3 jira_client.py link-types --json
```

Output:
```
Available link types (8 total):
  Blocks
    → inward: is blocked by
    → outward: blocks
  ...
```

This command is useful for:
- Discovering valid relationship names before calling `jira link`
- Checking instance-specific link types (varies by configuration)
- Scripting link operations reliably

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
- [EHCD-3293](https://your-jira-instance.example.com/jira/browse/EHCD-3293): Implement GitHub Release automation

### Bug Fixes
- [EHCD-3084](https://your-jira-instance.example.com/jira/browse/EHCD-3084): Search pages not cached

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

## Cross-Repo Invocation

The skill lives in `qdrant-memory-mcp` but is designed to be called from **any repository**. Four mechanisms make this work without copying files.

### Split Credential Model

JIRA credentials have different ownership scopes and must be stored separately:

| Variable | Scope | Where to Put It |
|---|---|---|
| `JIRA_INSTANCE_URL` | Shared — same Jira server for all projects | `qdrant-memory-mcp/.env` |
| `JIRA_PAT` | Shared — your personal token, works across all projects | `qdrant-memory-mcp/.env` |
| `JIRA_PROJECT_KEY` | Per-project — `ADO`, `AQD`, `EHCD`, etc. | `<caller-repo>/.env` or `--project` flag |

**Do not put `JIRA_PROJECT_KEY` in the shared `.env`.** It will be overridden by the caller's `.env` or `--project` flag anyway, but having the wrong key in the shared file causes confusing failures.

### Mechanism 1: sys.path Auto-Injection (Automatic)

[`jira_client.py`](scripts/jira_client.py) inserts its own directory into `sys.path` at startup, so `jira_config` is always importable regardless of the caller's `cwd`. No `cd` required.

```bash
# Works from ANY directory — no cd needed
python3 /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/agent/skills/jira-manager/scripts/jira_client.py check
```

### Mechanism 2: Layered .env Discovery (Automatic)

[`jira_config.py`](scripts/jira_config.py) loads **all** `.env` files it finds, merging them (later sources override earlier ones):

| Load Order | Location | Provides |
|---|---|---|
| 1st | Walk up from script's own directory | `JIRA_INSTANCE_URL`, `JIRA_PAT` (shared) |
| 2nd | Walk up from `cwd` | `JIRA_PROJECT_KEY` (per-project override) |
| 3rd | `$HOME/.env` | Global fallback |
| 4th | OS environment variables | Highest-priority override |

**Recommended setup:**

```bash
# qdrant-memory-mcp/.env  (shared — never committed)
JIRA_INSTANCE_URL=https://your-jira-instance.example.com/jira
JIRA_PAT=<your-personal-access-token>

# <caller-repo>/.env  (per-project — never committed)
JIRA_PROJECT_KEY=ADO
```

### Mechanism 3: --project Flag (Per-Invocation Override)

Override the project key on the CLI without editing any `.env` file:

```bash
python3 /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/agent/skills/jira-manager/scripts/jira_client.py \
  --project ADO \
  check

python3 /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/agent/skills/jira-manager/scripts/jira_client.py \
  --project ADO \
  comment ADO-241 --body "h2. Status Update..."
```

Use `--project` when:
- The caller's repo has no `.env`
- You need to target a different project than what's in `.env`
- Running one-off commands from a CI/CD pipeline

### Mechanism 4: --env-file Flag (Full Override)

When you need to supply all three variables from a single explicit file:

```bash
python3 /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/agent/skills/jira-manager/scripts/jira_client.py \
  --env-file /path/to/other-repo/.env \
  check
```

### Cross-Repo Invocation Diagnostic

If `check` fails with a missing-variable error, run this to see which `.env` files were loaded and what was resolved:

```bash
python3 -c "
import sys
sys.path.insert(0, '/Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/agent/skills/jira-manager/scripts')
from jira_config import JiraConfig
c = JiraConfig()
print('env_file (last loaded):', c.env_file)
print('instance:', c.instance_url)
print('project:', c.project_key)
print('pat (masked):', '***' + c.pat[-4:])
"
```

---

## Design Principles

This skill follows these principles:

1. **CLI-First** — Every operation callable via terminal; no wrapper scripts needed; inline script generation is FORBIDDEN
2. **Reusable** — `jira_client.py` is the canonical implementation; SKILL.md references it, never duplicates it
3. **Stdlib-Only** — No external dependencies; uses `urllib` throughout
4. **Zero-Boilerplate** — Templates and config eliminate repetitive setup
5. **Composable** — Unix philosophy; operations pipe together
6. **Discoverable** — Help text and references guide users to correct usage
7. **Credential-Safe** — PAT always loaded from `.env`; never hardcoded in source files
8. **Additive-First** — `comment` preferred over `update`; preserve ticket history by default
9. **Markup-Correct** — Jira Wiki Markup enforced; Markdown syntax forbidden in API payloads
10. **Cross-Repo** — Invocable from any repository via absolute path; no local copy required

## Version History

- **v4.2** (2026-07-23) — Issue linking fix: dual-strategy linker supports both `/issueLink` standard relationships and custom field hierarchical links; added `link-types` discovery command; improved `get` output shows linked issues; structured error messages for link failures
- **v4.1** (2026-06-01) — Cross-repo fix: `sys.path` auto-injection in `jira_client.py`; script-relative `.env` discovery in `jira_config.py`; `--env-file` global flag; cross-repo invocation guide in SKILL.md
- **v4.0** (2026-06-01) — Hardened: mandatory pre-flight gate, CLI-only enforcement, credential hygiene guard, comment-first policy, Jira markup enforcement, invocation checklist
- **v3.0** (2026-04-29) — CLI-first architecture, templates, centralized config
- **v2.0** — Stdlib urllib, Bearer auth, Server/Data Center support
- **v1.0** — Initial release with requests library
