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

```bash
python3 skills/jira-manager/scripts/jira_client.py comment AQD-123 \
  --body "Investigation complete. Root cause identified: DEXI API integration inefficiency."
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

## Design Principles

This skill follows these principles:

1. **CLI-First** — Every operation callable via terminal; no wrapper scripts needed
2. **Reusable** — `jira_client.py` is the canonical implementation; SKILL.md references it
3. **Stdlib-Only** — No external dependencies; uses `urllib` throughout
4. **Zero-Boilerplate** — Templates and config eliminate repetitive setup
5. **Composable** — Unix philosophy; operations pipe together
6. **Discoverable** — Help text and references guide users to correct usage

## Version History

- **v3.0** (2026-04-29) — CLI-first architecture, templates, centralized config
- **v2.0** — Stdlib urllib, Bearer auth, Server/Data Center support
- **v1.0** — Initial release with requests library
