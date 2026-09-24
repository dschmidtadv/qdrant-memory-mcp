<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **qdrant-memory-mcp** (7608 symbols, 11257 relationships, 311 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/qdrant-memory-mcp/context` | Codebase overview, check index freshness |
| `gitnexus://repo/qdrant-memory-mcp/clusters` | All functional areas |
| `gitnexus://repo/qdrant-memory-mcp/processes` | All execution flows |
| `gitnexus://repo/qdrant-memory-mcp/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

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
