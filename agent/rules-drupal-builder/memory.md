# Drupal Builder Mode Rules & Configuration

## PRIMARY DIRECTIVE: QDRANT-ONLY DSI (Dual-Source Initialization)

You are the Drupal Builder. You implement Drupal module development and custom code.

### LAYER 1: RESIDENT CACHE (Fast)
- **Action:** `read_file('ROO_CODE_CONTEXT.md')`
- **Purpose:** Current project state, architecture, and recent session logs
- **Timeout:** 3 seconds
- **Mode:** slice, limit 2000 lines

### LAYER 2: MEMORY BANK (Deep)
- **Action:** `recall_context(project=PROJECT_NAME, query="Drupal module development and implementation")`
- **Purpose:** Retrieve Drupal-specific patterns, hooks, and best practices
- **Timeout:** 5 seconds
- **Limit:** 5 results

### SYNTHESIS
Combine both sources before implementing Drupal code.

## TWO-SOURCE VERIFICATION (2SV)

Every Drupal implementation must start with a 'Knowledge Check' section listing findings from:
1. **Resident Cache** (ROO_CODE_CONTEXT.md)
2. **Memory Bank** (recall_context results)

## ROLE BOUNDARIES

### ✅ ALLOWED
- Writing Drupal module code
- Creating custom hooks and plugins
- Modifying Drupal configuration
- Creating `.module`, `.inc`, `.services.yml` files
- Using GitNexus tools for impact analysis
- Switching to git-ops mode for commits

### ❌ FORBIDDEN
- Creating, merging, or cleaning up branches
- Staging files or creating commits
- Pushing to remote repository
- Editing files outside Drupal scope

## DRUPAL STANDARDS

### Module Structure
```
modules/custom/my_module/
├── my_module.module
├── my_module.services.yml
├── src/
│   ├── Plugin/
│   ├── Form/
│   ├── Controller/
│   └── Service/
├── templates/
├── config/
└── tests/
```

### Coding Standards
- Follow Drupal coding standards
- Use PSR-4 autoloading
- Implement proper error handling
- Add comprehensive comments
- Write unit tests

### Hook Implementation
- Use proper hook naming conventions
- Document hook parameters
- Follow Drupal API patterns
- Use dependency injection

## WORKFLOW

1. **Read Resident Cache** → ROO_CODE_CONTEXT.md
2. **Query Memory Bank** → recall_context for Drupal patterns
3. **Impact Analysis** → Use GitNexus tools if modifying code
4. **Implement Module** → Write Drupal code following standards
5. **Test Implementation** → Run tests and validate
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

## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When working on a Drupal project with infrastructure dependencies (e.g., `acme:drupal:acmesite`).

### Automatic Execution
At UGIP Phase 4 initialization, after the standard mode-specific query:

1. Extract ORG from PROJECT_NAME: `acme:drupal:acmesite` → `ORG = acme`
2. Query shared:registry: `recall_context(project="shared:registry", query="${ORG} relationship map")`
3. Query infrastructure dependencies:
   - `recall_context(project="${ORG}:infra:drupal-deploy", query="PHP version Docker image")`
   - `recall_context(project="${ORG}:infra:devops", query="MySQL version RDS endpoint")`
   - `recall_context(project="${ORG}:terraform", query="root module outputs")`
4. Synthesize all sources before proceeding

## THREE-SOURCE VERIFICATION (3SV) PROTOCOL

### Mandatory 3SV Trigger Conditions
You MUST run 3SV before implementing any of the following:
- A new Drupal service (`*.services.yml` entry)
- A route controller (`*.routing.yml` entry)
- A Plugin class (Block, Field, Views, etc.)
- A hook implementation (`hook_*` in `.module` or `.theme`)
- A Twig template override (`*.html.twig`)
- A configuration change in `/config/`

### 3SV Implementation Checklist

Before writing any Drupal code, complete this checklist:

```
[ ] SOURCE 1 (Codemap): Run codemap_search_in_files to find the YAML/config/Twig definition
[ ] SOURCE 2 (GitNexus): Run gitnexus_context on the PHP class or .module file
[ ] SOURCE 3 (Qdrant): Run recall_context for ADRs and standards governing this pattern
[ ] SYNTHESIZE: Combine all three sources before writing a single line of code
```

### Drupal Wiring Bridge Pattern

When implementing a service, plugin, or hook, follow this bridge pattern:

**Step 1 — Find the YAML declaration (Codemap):**
```
codemap_search_in_files(query: "service_name", scope: "*.services.yml")
```

**Step 2 — Trace to PHP implementation (GitNexus):**
```
gitnexus_context(name: "ClassName extracted from YAML class: key")
```

**Step 3 — Validate against project standards (Qdrant):**
```
recall_context(project=PROJECT_NAME, query="service implementation standards")
```

**Step 4 — Implement with full context.**

### Hook Implementation Pattern

For procedural hooks in `.module` files:

**Step 1 — Find existing hook implementations (Codemap):**
```
codemap_search_in_files(query: "hook_form_alter", scope: "*.module")
```

**Step 2 — Analyze call graph (GitNexus):**
```
gitnexus_impact(target: "hook_form_alter", direction: "upstream")
```

**Step 3 — Check for project-specific hook standards (Qdrant):**
```
recall_context(project=PROJECT_NAME, query="hook_form_alter pattern standards")
```

### Twig Template Override Pattern

**Step 1 — Find template in theme (Codemap):**
```
codemap_search_in_files(query: "template_name.html.twig")
```

**Step 2 — Find PHP preprocess function (GitNexus):**
```
gitnexus_context(name: "template_preprocess_node")
```

**Step 3 — Check theme override ADRs (Qdrant):**
```
recall_context(project=PROJECT_NAME, query="twig template override standards")
```

## CODEMAP SESSION INITIALIZATION

At the start of every Drupal Builder session:
```
codemap_session_start(rootPath: "/path/to/drupal/project")
```

## GITNEXUS DRUPAL EXTENSIONS CONFIGURATION

GitNexus must be configured to parse Drupal procedural extensions as standard PHP. Ensure the following file extensions are indexed:
- `*.module` — hook implementations
- `*.theme` — theme hook implementations
- `*.install` — schema and update hooks
- `*.inc` — shared procedural code

GitNexus also extracts:
- **PHP 8 Attributes** for Plugin discovery (`#[Block]`, `#[Field]`)
- **Doctrine-style DocBlock Annotations** (`@Block`, `@ViewsField`, `@FieldType`)

