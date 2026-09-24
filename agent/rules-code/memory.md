# Code Mode Rules & Configuration

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

## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When writing code that depends on infrastructure or other projects (e.g., Drupal code that depends on PHP version).

### Automatic Execution
At UGIP Phase 4 initialization, after the standard mode-specific query:

1. Extract ORG from PROJECT_NAME: `acme:drupal:acmesite` → `ORG = acme`
2. Query shared:registry: `recall_context(project="shared:registry", query="${ORG} relationship map")`
3. Query dependencies for code requirements:
   - `recall_context(project="${ORG}:infra:drupal-deploy", query="PHP version Docker image")`
   - `recall_context(project="${ORG}:infra:devops", query="MySQL version RDS endpoint")`
4. Synthesize all sources before proceeding

## Triple-Source Verification (3SV) Protocol

### When to Apply 3SV
- MANDATORY before modifying any PHP/TypeScript code
- MANDATORY before changing Drupal YAML configurations
- MANDATORY before refactoring class hierarchies
- MANDATORY before implementing architectural changes

### The Three Sources
1. **Qdrant (Semantic)** — recall_context for ADRs and decisions
2. **GitNexus (Structural)** — gitnexus_impact for blast radius
3. **Codemap (Schema)** — codemap_search for YAML/routing dependencies

### 3SV Execution Order
1. Read ROO_CODE_CONTEXT.md (resident cache)
2. Query Qdrant: `recall_context(project, query="[code pattern/decision]")`
3. Run GitNexus: `gitnexus_impact(target, direction="upstream")`
4. Check Codemap: `codemap_search("[schema/routing patterns]")`
5. Document findings in "Knowledge Check" section
6. Proceed ONLY if all sources align and risk is acceptable

### Knowledge Check Template
```
## Knowledge Check (3SV)

**Qdrant (Semantic):**
- [Relevant ADRs and code patterns]

**GitNexus (Structural):**
- [Blast radius analysis]
- [Affected symbols and call chains]

**Codemap (Schema):**
- [YAML wiring dependencies]
- [Drupal routing implications]

**Synthesis:**
- [Confirm all three sources align]
- [Identify any conflicts or risks]
```

### Code Mode: Mandatory 3SV
- MUST run before any file modifications
- MUST document blast radius
- MUST verify no breaking changes
- MUST block if risk is HIGH or CRITICAL
- Can proceed with LOW/MEDIUM risk if well-documented

### Risk Assessment
- **LOW:** Single file, no external callers, isolated change
- **MEDIUM:** Multiple files, 2-5 callers, contained impact
- **HIGH:** 5+ files, 5+ callers, multiple execution flows affected
- **CRITICAL:** Core utilities, 10+ callers, breaking changes

### Decision Matrix
- **PROCEED:** All sources align, risk is LOW/MEDIUM
- **REVISE:** Sources conflict or risk is HIGH, adjust approach
- **BLOCK:** Risk is CRITICAL or unacceptable breaking changes
