---
name: ugip
description: Unified Global Initialization Protocol. Run at the start of every session to initialize GitNexus, flush .ai-memory/ to Qdrant, read ROO_CODE_CONTEXT.md, check the git branch, and run role-specific recall_context queries. Invoke with /ugip.
---

# Unified Global Initialization Protocol (UGIP)

Execute each phase in order. Do not skip phases. Report completion status after each phase.

---

## Phase 0 — Structural Memory Init (GitNexus)

Check if `.gitnexus/` exists in the project root.

- If present: confirm index is fresh (no stale warning from GitNexus MCP tools).
- If absent: run in terminal:
  ```
  npx -y gitnexus@latest analyze --drop-embeddings
  ```

After init, use only `gitnexus_impact` and `gitnexus_context` MCP tools for all subsequent analysis — not the terminal.

---

## Phase 1 — Pre-flight Cleanup (.ai-memory/)

Check if `./.ai-memory/` contains any files.

- If files exist: flush each one to Qdrant via `memorize_context`. Timeout: 5 seconds. Fail silently if Qdrant is unavailable.
- If empty or absent: continue.

---

## Phase 2 — Atomic Initialization

Run these three steps, then synthesize before proceeding:

1. Read `ROO_CODE_CONTEXT.md` in the project root (limit 2000 lines, timeout 3s). If missing, continue with empty context.
2. Determine `PROJECT_NAME` as `basename` of the current working directory.
3. Call `recall_context(project=PROJECT_NAME, query="<role-specific query from Mode Queries table>", limit=5)`. Timeout: 5s.

**Mode Queries table:**

| Role | Query |
|---|---|
| architect | design patterns and architecture |
| code | code standards and linting rules |
| ask | knowledge base and Q&A context |
| debug | debugging procedures and error patterns |
| orchestrator | orchestration and cross-service coordination |
| drupal-builder | Drupal module development and implementation |
| documentation-writer | documentation templates and patterns |
| test-engineer | testing strategies and test patterns |
| config-manager | Drupal configuration and settings |
| performance-engineer | performance optimization techniques |
| ux-reviewer | UX best practices and design patterns |
| compliance-reviewer | compliance requirements and standards |
| security-review | security patterns and vulnerability analysis |
| standards-reviewer | code standards and best practices |
| cloud-architect | cloud architecture and AWS patterns |
| devops-engineer | CI/CD pipelines and infrastructure |
| aws-engineer | AWS CLI and infrastructure management |
| knowledge-architect | knowledge base and architectural decisions |
| sre | SRE practices and operational procedures |
| git-ops | Git workflows and repository management |
| drupal-vision | visual design and component specifications |

If no role is active, use `"project overview and architecture"` as the query.

For projects with an org namespace (e.g. `acme:drupal:acmesite`), also run:
- `recall_context(project="shared:registry", query="<ORG> relationship map")`
- `recall_context(project="<ORG>:infra:drupal-deploy", query="PHP version Docker image")`

---

## Phase 3 — Git Branch Check

Run `git branch --show-current` (timeout: 2s).

Protected branches: `main`, `master`, `develop`, `stage`, `production`.

- **code or architect role** on a protected branch: stop and ask the user about creating a feature branch before continuing.
- **All other roles** on a protected branch: proceed with a warning.
- On timeout or failure: ask the user for confirmation before continuing.

---

## Phase 4 — Role-Specific Init

Call `recall_context` again using the role-specific query from the Mode Queries table above, with `limit=5`. This pass is focused on role behavior rather than project state — synthesize it with Phase 2 results.

**Codemap session start (architect role on Drupal projects only):**

If the active role is `architect` and the project contains a Drupal codebase (i.e. has `html/` or `web/` directory, or has Drupal-related files), call:
```
codemap_session_start(rootPath: "<absolute project root>")
```

Fail silently if Codemap is unavailable. Skip for non-Drupal projects.

---

## Phase 5 — Session Close

Invoke this phase at the end of every session, before exiting. Do not skip it.

1. **Determine the session brief** — a 3-5 word kebab-case summary of the primary work done (e.g. `redis-caching-migration`, `runner-architecture-adr`, `ugip-skill-setup`).
2. **Write a session artifact** to `./.ai-memory/` named:
   ```
   YYYY-MM-DD-<role>-<brief>.md
   ```
   Use today's date (from the `currentDate` context variable if available, otherwise `date +%Y-%m-%d`).
3. **Contents of the artifact:**
   ```markdown
   # Session: <brief>
   **Date:** YYYY-MM-DD
   **Role:** <active role>
   **Branch:** <branch>
   **Project:** <PROJECT_NAME>

   ## Decisions Made
   - <bullet per architectural or implementation decision>

   ## Files Modified
   - <path> — <what changed>

   ## Blast Radius Found
   - <any HIGH/CRITICAL impact findings from gitnexus_impact>

   ## ADRs Created
   - <any ADR files written this session>

   ## Open Items
   - <anything left unresolved or deferred>
   ```
4. **Flush the artifact to Qdrant** immediately via `memorize_context(project=PROJECT_NAME, content=<file contents>, tags=[role, brief, "session-log"])`. Timeout: 5 seconds. Fail silently if Qdrant is unavailable.
5. Confirm the file was written and report its path.

---

## Completion Checklist

After all startup phases, output this checklist:

```
## UGIP Complete

- [x/—] Phase 0: .gitnexus/ present / initialized
- [x/—] Phase 1: .ai-memory/ flushed / empty
- [x/—] Phase 2: ROO_CODE_CONTEXT.md read / missing (continuing with empty context)
- [x/—] Phase 2: recall_context called — N results
- [x/—] Phase 3: Branch = <branch> — safe / WARNING: protected branch
- [x/—] Phase 4: Role-specific recall_context called — N results
- [x/—] Phase 4: Codemap session started / skipped (non-architect or non-Drupal)
```

Then state the active role and PROJECT_NAME, and confirm ready to proceed.

At end of session, run Phase 5 and confirm:
```
## Session Close Complete

- [x] Phase 5: .ai-memory/<filename> written and flushed to Qdrant
```

---

## Error Handling

| Failure | Action |
|---|---|
| Qdrant unavailable | Continue with resident cache only |
| Ollama unavailable | Log and continue |
| ROO_CODE_CONTEXT.md missing | Continue with empty context |
| GitNexus unavailable | Fall back to 2SV (Qdrant + Codemap) |
| Git branch check fails | Ask user for confirmation |
