<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **qdrant-memory-mcp** (6471 symbols, 8576 relationships, 207 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/qdrant-memory-mcp/context` | Codebase overview, check index freshness |
| `gitnexus://repo/qdrant-memory-mcp/clusters` | All functional areas |
| `gitnexus://repo/qdrant-memory-mcp/processes` | All execution flows |
| `gitnexus://repo/qdrant-memory-mcp/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- qdrant:start -->
# Qdrant-MCP — Semantic Memory

This project uses Qdrant as its semantic memory bank. Use `recall_context` and `memorize_context` to retrieve and store architectural decisions, Drupal wiring, and non-code context.

## The Dual-Brain Decision Matrix

You have two memory systems. Use them in tandem — never in isolation.

| Question | Use This Brain | Tool |
|----------|---------------|------|
| "What calls this function?" | GitNexus (Structural) | `gitnexus_impact()` |
| "What does this service.yml wire to?" | Qdrant (Semantic) | `recall_context()` |
| "Which files will break if I change this method?" | GitNexus (Structural) | `gitnexus_impact()` |
| "What was the ADR for this architectural choice?" | Qdrant (Semantic) | `recall_context()` |
| "How does this Drupal hook get invoked?" | Qdrant (Semantic) | `recall_context()` |
| "What is the call chain for this TypeScript class?" | GitNexus (Structural) | `gitnexus_context()` |
| "What dynamically-loaded plugins depend on this?" | Qdrant (Semantic) | `recall_context()` |

## Brain 1: GitNexus (Structural Memory)

**What it does:** Maps the exact Abstract Syntax Tree (AST) of the codebase.

**When to use it:** Use GitNexus impact and context tools whenever modifying PHP, TypeScript, or JavaScript code. Use it to find explicit function call chains, class dependencies, and exactly which files will break if you change a method signature.

**Limitations:** Does NOT understand YAML routing, Drupal Hooks, or dynamically loaded plugins.

## Brain 2: Qdrant-MCP (Semantic Memory)

**What it does:** Stores architectural decisions, documentation, and non-code context.

**When to use it:** Use `recall_context` to retrieve Drupal architectural wiring (like `*.services.yml` mappings), hook implementations, project rules, and historical ADRs. Use `memorize_context` when you discover a new "Drupal magic" connection that GitNexus cannot see.

## Mandatory Dual-Brain Workflow

### Before ANY code edit:
1. `gitnexus_impact({target: "symbolName", direction: "upstream"})` — structural blast radius
2. `recall_context(project=PROJECT_NAME, query="context about this symbol/module")` — semantic context

### After discovering Drupal wiring GitNexus cannot see:
```
memorize_context(
  project=PROJECT_NAME,
  content="## Drupal Hook Discovery\n[describe the hook/service wiring]",
  tags=["drupal", "hook", "semantic-gap"]
)
```

### When to use ONLY GitNexus:
- Pure TypeScript/JavaScript refactors with no Drupal hooks
- Renaming symbols: always use `gitnexus_rename()`, never find-and-replace

### When to use ONLY Qdrant:
- Retrieving ADRs and historical decisions
- Understanding YAML service definitions
- Loading project rules at task start

<!-- qdrant:end -->
