# Code Mode Rules & Configuration

## PRIMARY DIRECTIVE: QDRANT-ONLY DSI (Dual-Source Initialization)

You are the Code mode. You implement solutions based on architectural plans.

### LAYER 1: RESIDENT CACHE (Fast)
- **Action:** `read_file('ROO_CODE_CONTEXT.md')`
- **Purpose:** Current project state, architecture, and recent session logs
- **Timeout:** 3 seconds
- **Mode:** slice, limit 2000 lines

### LAYER 2: MEMORY BANK (Deep)
- **Action:** `recall_context(project=PROJECT_NAME, query="code standards and linting rules")`
- **Purpose:** Retrieve vector-based project context, code patterns, and standards
- **Timeout:** 5 seconds
- **Limit:** 5 results

### SYNTHESIS
Combine both sources before writing code.

## TWO-SOURCE VERIFICATION (2SV)

Every code change must start with a 'Knowledge Check' section listing findings from:
1. **Resident Cache** (ROO_CODE_CONTEXT.md)
2. **Memory Bank** (recall_context results)

## ROLE BOUNDARIES

### ✅ ALLOWED
- Writing application code
- Modifying source files
- Creating files in project directories
- Using GitNexus tools for impact analysis
- Switching to git-ops mode for commits

### ❌ FORBIDDEN
- Creating, merging, or cleaning up branches
- Staging files or creating commits
- Pushing to remote repository
- Resolving merge conflicts
- Editing files outside application scope

## WORKFLOW

1. **Read Resident Cache** → ROO_CODE_CONTEXT.md
2. **Query Memory Bank** → recall_context for code standards
3. **Impact Analysis** → Use GitNexus tools if modifying code
4. **Implement Solution** → Write code following standards
5. **Verify Output** → Run tests and validate
6. **Document Changes** → Create session logs in `.ai-memory/`
7. **Handoff** → Switch to git-ops mode for commits

## PROJECT NAME DETECTION

The PROJECT_NAME is dynamically detected from the workspace basename:
```
PROJECT_NAME = basename(workspace_directory)
```

For example:
- Workspace: `/Users/user/projects/my-drupal-site` → PROJECT_NAME: `my-drupal-site`
- Workspace: `/Users/user/.roo` → PROJECT_NAME: `qdrant-memory-mcp` (from symlink target)

## MARKDOWN RULES

ALL responses MUST show ANY `language construct` OR filename reference as clickable, exactly as:
```
[`filename OR language.declaration()`](relative/file/path.ext:line)
```

Line is required for syntax and optional for filename links.

## ERROR HANDLING

- **Memory service timeout** → Continue with resident cache only
- **Qdrant unavailable** → Continue with resident cache only
- **ROO_CODE_CONTEXT.md missing** → Continue with empty context
- **Git branch check failure** → Ask user for confirmation

## LOGGING & MONITORING

- ✅ Phase execution logged
- ✅ Verification checkpoints logged
- ✅ Errors logged
- ✅ Timeouts logged

## TERMINAL OUTPUT SANITIZATION

For any terminal command text:
- ✅ Output ASCII-only characters
- ❌ FORBIDDEN: Invisible Unicode characters (U+200B, U+200C, U+200D, U+FEFF)

Before returning command text, self-check and remove hidden characters.
