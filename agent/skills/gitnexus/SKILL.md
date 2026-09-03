---
name: gitnexus
description: "Code intelligence powered by GitNexus knowledge graph. Use for understanding code architecture, exploring execution flows, analyzing blast radius before changes, debugging with call graphs, safe refactoring with rename support, and CLI operations like indexing and wiki generation."
triggers:
  - gitnexus
  - code graph
  - call graph
  - blast radius
  - impact analysis
  - execution flow
  - who calls
  - what depends
---

# GitNexus — Code Intelligence Skill

This is the umbrella skill for GitNexus code intelligence. It provides access to specialized sub-skills:

## Sub-Skills

| Sub-Skill | Use When |
|-----------|----------|
| `gitnexus-exploring` | Understanding how code works, tracing execution flows |
| `gitnexus-impact-analysis` | Checking what breaks if you change something |
| `gitnexus-debugging` | Tracing bugs, finding error sources |
| `gitnexus-refactoring` | Renaming, extracting, splitting code safely |
| `gitnexus-cli` | Running GitNexus CLI commands (analyze, status, wiki) |
| `gitnexus-guide` | Reference for available tools, schema, and workflows |

## Quick Reference

- **Impact analysis:** `gitnexus_impact({target: "symbolName", direction: "upstream"})`
- **Symbol context:** `gitnexus_context({name: "symbolName"})`
- **Query flows:** `gitnexus_query({search_query: "concept"})`
- **Trace paths:** `gitnexus_trace({from: "A", to: "B"})`
- **Safe rename:** `gitnexus_rename({symbol_name: "old", new_name: "new"})`
- **Pre-commit check:** `gitnexus_detect_changes()`
