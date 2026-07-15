# Skill: Bridge Drupal Wiring to PHP

## Goal
Locate the PHP implementation of a YAML-defined service, configuration entry, Twig template, or annotated Plugin. This skill bridges the declarative layer (YAML/config/Twig) to the structural layer (PHP classes and procedural hooks) using the Three-Brain Architecture.

## Prerequisites
- Codemap session initialized: `codemap_session_start(rootPath: "...")`
- GitNexus indexed: `gitnexus analyze --drop-embeddings` (run once per project)
- Qdrant MCP server running

## When to Use This Skill
- You have a service ID (e.g., `logger.factory`) and need to find its PHP class
- You have a route name (e.g., `node.view`) and need to find its controller
- You have a Twig template name and need to find its preprocess function
- You have a config key (e.g., `views.view.frontpage`) and need to find its PHP handler
- You have a Plugin ID and need to find its annotated class

---

## Step-by-Step Execution

### STEP 1: Codemap — Find the Declarative Definition

Use `codemap_search_in_files` to locate the YAML, config, or Twig file that declares the target.

**For a Service:**
```
codemap_search_in_files(query: "SERVICE_ID", scope: "*.services.yml")
```
Extract the `class:` value from the result.

**For a Route:**
```
codemap_search_in_files(query: "ROUTE_NAME", scope: "*.routing.yml")
```
Extract the `_controller:` value from the result.

**For a View or Config:**
```
codemap_search_in_files(query: "CONFIG_KEY", scope: "config/")
```
Extract the relevant handler or plugin ID.

**For a Twig Template:**
```
codemap_search_in_files(query: "TEMPLATE_NAME.html.twig")
```
Note the template file path and any `{% extends %}` or `{% block %}` declarations.

**For a Plugin:**
```
codemap_search_in_files(query: "plugin_id: PLUGIN_ID")
```
Or search for the annotation:
```
codemap_search_in_files(query: "@Block(id=\"PLUGIN_ID\")")
```

---

### STEP 2: GitNexus — Open the Structural Analysis

Use the class name, hook name, or `.module` filename discovered in Step 1.

**For a PHP Class (Service, Controller, Plugin):**
```
gitnexus_context(name: "ClassName")
```
This returns:
- Full file path
- Methods and their call graphs
- Incoming callers (what calls this class)
- Outgoing callees (what this class calls)
- Which execution flows it participates in

**For a Procedural Hook in a .module file:**
```
gitnexus_context(name: "mymodule_hook_form_alter")
```
Or query by file:
```
gitnexus_query(query: "hook implementations in mymodule.module")
```

**For Blast Radius Analysis:**
```
gitnexus_impact(target: "ClassName", direction: "upstream")
```

---

### STEP 3: Qdrant — Validate Against Project Memory

Retrieve ADRs and standards that govern this wiring pattern.

```
recall_context(project=PROJECT_NAME, query="SERVICE_ID OR HOOK_NAME architecture standards")
```

Look for:
- ADRs that document why this service/hook was implemented this way
- Coding standards specific to this pattern
- Known issues or gotchas documented in previous sessions
- Cross-project contracts (if using shared:registry pattern)

---

## Output Format

After completing all three steps, produce a **Wiring Report**:

```markdown
## Wiring Report: [Target Name]

### Declarative Layer (Codemap)
- **File:** `path/to/definition.services.yml` (line N)
- **Declaration:** `service_id: class: Drupal\module\ClassName`
- **Arguments:** `['@dependency1', '@dependency2']`
- **Tags:** `[{name: event_subscriber}]`

### Structural Layer (GitNexus)
- **Class:** `Drupal\module\ClassName`
- **File:** `modules/custom/module/src/ClassName.php`
- **Implements:** `InterfaceName`
- **Key Methods:** `methodA()`, `methodB()`
- **Called By:** `OtherClass::someMethod()` (3 callers)
- **Calls:** `EntityTypeManager::getStorage()`, `LoggerFactory::get()`
- **Execution Flows:** `[flow-name-1, flow-name-2]`

### Semantic Layer (Qdrant)
- **ADR:** ADR-007 — Constructor injection required for all services
- **Standard:** Services must implement `ContainerInjectionInterface`
- **Known Issues:** None documented
```

---

## Common Patterns

### Pattern 1: Service → Class
```
YAML: mymodule.services.yml
  mymodule.processor:
    class: Drupal\mymodule\Processor
    arguments: ['@entity_type.manager']

GitNexus: gitnexus_context(name: "Processor")
→ Returns: file path, methods, callers, callees
```

### Pattern 2: Route → Controller
```
YAML: mymodule.routing.yml
  mymodule.page:
    path: '/mymodule/page'
    defaults:
      _controller: '\Drupal\mymodule\Controller\PageController::build'

GitNexus: gitnexus_context(name: "PageController")
→ Returns: build() method, dependencies, response type
```

### Pattern 3: Hook → Module File
```
Codemap: codemap_search_in_files(query: "hook_node_presave", scope: "*.module")
→ Returns: mymodule.module line 45

GitNexus: gitnexus_context(name: "mymodule_node_presave")
→ Returns: function signature, what it calls, blast radius
```

### Pattern 4: Twig → Preprocess
```
Codemap: codemap_search_in_files(query: "node--article.html.twig")
→ Returns: themes/mytheme/templates/node--article.html.twig

GitNexus: gitnexus_context(name: "mytheme_preprocess_node")
→ Returns: variables added, conditions, called functions
```

### Pattern 5: Plugin ID → Annotated Class
```
Codemap: codemap_search_in_files(query: "id = \"my_block\"")
→ Returns: src/Plugin/Block/MyBlock.php line 12

GitNexus: gitnexus_context(name: "MyBlock")
→ Returns: build() method, dependencies, cache metadata
```

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `NOT_INITIALIZED` from Codemap | Session not started | Run `codemap_session_start(rootPath: "...")` |
| `symbol not found` from GitNexus | Class not indexed | Run `gitnexus analyze --drop-embeddings` |
| Empty Qdrant results | No ADRs stored yet | Proceed with implementation; memorize findings after |
| YAML class not in GitNexus | Contrib module class | Use `codemap_search_in_files` to read the PHP directly |

---

## Related Skills
- `agent/commands/generate-skill.md` — Generate new skill files
- `agent/commands/sequential-feynman.md` — Deep explanation of complex patterns

## Tags
`drupal`, `wiring`, `services`, `routing`, `twig`, `hooks`, `plugins`, `3sv`, `codemap`, `gitnexus`, `qdrant`
