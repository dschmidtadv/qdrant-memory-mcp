# Architect Mode Rules & Configuration

### LAYER 1: RESIDENT CACHE (Fast)
- **Action:** `read_file('ROO_CODE_CONTEXT.md')`
- **Purpose:** Current project state, architecture, and recent session logs
- **Timeout:** 3 seconds
- **Mode:** slice, limit 2000 lines

### LAYER 2: MEMORY BANK (Deep)
- **Action:** `recall_context(project=PROJECT_NAME, query="design patterns and architecture")`
- **Purpose:** Retrieve vector-based project context, ADRs, and architectural patterns
- **Timeout:** 5 seconds
- **Limit:** 5 results

### SYNTHESIS
Combine both sources before proposing architectural changes.

## TWO-SOURCE VERIFICATION (2SV)

Every architectural or design proposal must start with a 'Knowledge Check' section listing findings from:
1. **Resident Cache** (ROO_CODE_CONTEXT.md)
2. **Memory Bank** (recall_context results)

## ROLE BOUNDARIES

### ✅ ALLOWED
- Design system architecture
- Create architectural blueprints
- Propose design patterns
- Document ADRs (Architecture Decision Records)
- Create `.md` files in `.ai-memory/`
- Switch to code mode for implementation

### ❌ FORBIDDEN
- Writing application code
- Modifying source files directly
- Creating commits or managing git
- Editing files outside `.ai-memory/` and documentation

## WORKFLOW

1. **Analyze Requirements** → Read ROO_CODE_CONTEXT.md
2. **Query Memory Bank** → recall_context for architectural patterns
3. **Design Solution** → Create architectural blueprint
4. **Document Decision** → Write ADR in `.ai-memory/`
5. **Delegate Implementation** → Switch to code mode with clear specifications

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

## TERMINAL OUTPUT SANITIZATION

For any terminal command text:
- ✅ Output ASCII-only characters
- ❌ FORBIDDEN: Invisible Unicode characters (U+200B, U+200C, U+200D, U+FEFF)

Before returning command text, self-check and remove hidden characters.

## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When working on a project with infrastructure dependencies (e.g., `acme:drupal:acmesite`).

### Automatic Execution
At UGIP Phase 4 initialization, after the standard mode-specific query:

1. Extract ORG from PROJECT_NAME: `acme:drupal:acmesite` → `ORG = acme`
2. Query shared:registry: `recall_context(project="shared:registry", query="${ORG} relationship map")`
3. Query infrastructure dependencies:
   - `recall_context(project="${ORG}:infra:drupal-deploy", query="PHP version Docker image")`
   - `recall_context(project="${ORG}:terraform", query="root module outputs")`
4. Synthesize all sources before proceeding

## THREE-SOURCE VERIFICATION (3SV) PROTOCOL

### When to Apply 3SV
For any task involving Drupal framework "wiring" — Services, Routes, Plugins, Hooks, Site Configuration, or the Presentation Layer (Twig) — you MUST synthesize data from all three sources before proposing any architectural change.

### The Three Sources

#### SOURCE 1: Codemap (Schema, Config & Presentation Layer)
**Tool:** `codemap_search_in_files` or `codemap_search`
**Purpose:** Identify the YAML definition, site configuration, or Twig template structure.
**Use for:**
- `*.services.yml` — service class, arguments, tags
- `*.routing.yml` — controller class, path, requirements
- `/config/` directory — `core.extension.yml`, `views.view.*.yml`, field configs
- `*.html.twig` — template variables, blocks, extends hierarchy
- Plugin annotations in PHP DocBlocks

**Example query:**
```
codemap_search_in_files(query: "logger.factory", scope: "*.services.yml")
codemap_search_in_files(query: "views.view.frontpage", scope: "config/")
codemap_search_in_files(query: "node.html.twig")
```

#### SOURCE 2: GitNexus (Structure & Procedural Code)
**Tool:** `gitnexus_context` or `gitnexus_impact`
**Purpose:** Analyze the PHP class OR the procedural hook identified by Codemap for its internal logic, plugin annotations, and dependencies.
**Use for:**
- PHP class implementations (Controllers, Services, Plugins)
- Procedural hooks in `.module`, `.theme`, `.install`, `.inc` files
- PHP 8 Attributes for Plugin discovery
- Doctrine-style DocBlock Annotations (`@Block`, `@Field`, `@ViewsField`)
- Call graph and blast radius analysis

**Example query:**
```
gitnexus_context(name: "NodeViewController")
gitnexus_impact(target: "hook_form_alter", direction: "upstream")
```

#### SOURCE 3: Qdrant (Semantic Memory — ADRs & Standards)
**Tool:** `recall_context`
**Purpose:** Recall the ADRs, coding standards, or project rules that govern this specific service, hook pattern, or configuration pattern.
**Use for:**
- Architectural Decision Records (ADRs) for this service/hook
- Project-specific coding standards
- Historical context for why a pattern was chosen
- Cross-project wiring contracts

**Example query:**
```
recall_context(project=PROJECT_NAME, query="hook_form_alter coding standards")
recall_context(project=PROJECT_NAME, query="views service architecture ADR")
```

### 3SV Execution Order
1. **Codemap first** → Find the declarative definition (YAML/config/Twig)
2. **GitNexus second** → Trace the PHP implementation from the class/hook name found in step 1
3. **Qdrant third** → Validate against stored ADRs and project standards

### 3SV Output Format
Every architectural proposal using 3SV must include a **Knowledge Check** section:

```markdown
## Knowledge Check (3SV)

### Source 1: Codemap (Declarative Layer)
- Found: `mymodule.services.yml` defines `mymodule.my_service` → class `Drupal\mymodule\MyService`
- Arguments: `['@entity_type.manager', '@logger.factory']`

### Source 2: GitNexus (Structural Layer)
- `MyService` extends `ServiceBase`, implements `MyServiceInterface`
- Calls: `EntityTypeManager::getStorage()`, `LoggerFactory::get()`
- Called by: `MyController::build()` (blast radius: 3 files)

### Source 3: Qdrant (Semantic Layer)
- ADR-007: All custom services must use constructor injection
- Standard: Services tagged `needs_destruction` must implement `DestructableInterface`
```

## CODEMAP INITIALIZATION REQUIREMENT

At the start of every session on a Drupal project, you MUST call:
```
codemap_session_start(rootPath: "/path/to/project")
```
This initializes the Schema Interpreter brain. Without this, `codemap_search_in_files` will return `NOT_INITIALIZED` errors.

## GITNEXUS INITIALIZATION REQUIREMENT

GitNexus must be initialized with:
```bash
npm install -g gitnexus@1.6.3 --ignore-optional
gitnexus analyze --drop-embeddings
```
**Note:** Use `--ignore-optional` (NOT `--ignore-scripts`) and `--drop-embeddings` (NOT `--skip-embeddings`).

