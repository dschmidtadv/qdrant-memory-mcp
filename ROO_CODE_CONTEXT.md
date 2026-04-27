# Project Context: Qdrant-MCP Hybrid Memory Architecture

## Project Overview

This project transitions the AI agent's "second brain" from a UI-heavy AnythingLLM deployment to a headless, high-performance architecture. It utilizes Qdrant as the vector database and a custom TypeScript Model Context Protocol (MCP) server.

**Status:** ✓ Migration Complete (2026-04-23)
- AnythingLLM removed entirely
- Qdrant is now the single source of truth
- Global rules system implemented with dynamic project detection
- Cross-project validation passed

---

## Architecture Details

### Vector Database
- **Qdrant** running in a local Docker container
- Mapped to AWS EFS in production to ensure state persists across task lifecycles
- Single source of truth for all agent memory operations

### Transport Layer
The MCP server runs as a **local Node.js process** using **stdio transport** (not HTTP). It communicates with Claude via standard input/output, making it ideal for local development and integration with Claude Desktop.

**Important:** The MCP server is NOT a Docker container. It runs as a native Node.js process via `node dist/index.js` and connects to Qdrant and Ollama via HTTP.

**Startup:**
```bash
cd mcp-server && npm run build && npm start
```

**Verification:**
```
Connecting to Qdrant at: http://localhost:6333
Environment: local
Collection: agent-memory (768-dim)
MCP Server connected via stdio transport
Metrics server listening on :9091
```

### Hybrid Embeddings

**Local Development:**
- Uses a containerized Ollama instance running the nomic-embed-text model
- Runs alongside Qdrant in docker-compose

**Cloud Production:**
- Uses Amazon Bedrock Titan Text Embeddings v2 natively via the AWS SDK
- Prevents compute bottlenecks on AWS Fargate

### API Gateway
The agent communicates with the primary LLM (bedrock-haiku-4.5) directly via the RIVA CloudFront edge-shim (https://d3vhktud33lq4v.cloudfront.net/v1) using required custom authentication headers:
- `x-app-id: riva-roo-code`
- `x-developer-id: dschmidt`

---

## Dual-Source Initialization (DSI) Protocol

### LAYER 1: RESIDENT CACHE (Fast)
**Action:** `read_file('ROO_CODE_CONTEXT.md')`

**Purpose:** Current project state, architecture, and recent session logs

**Constraint:** Treat as absolute truth for implementation details

### LAYER 2: MEMORY BANK (Deep)
**Action:** `recall_context(project=PROJECT_NAME, query=...)`

**Purpose:** Retrieve vector-based project context, ADRs, and code patterns from Qdrant

**Constraint:** Use Qdrant as your exclusive external memory source

### Tool Execution Hierarchy
1. Read `ROO_CODE_CONTEXT.md`
2. Execute `recall_context` using the task description as the query
3. Synthesize both sources

### Two-Source Verification (2SV)
Every architectural proposal must start with a 'Knowledge Check' section listing findings from both ROO_CODE_CONTEXT and Qdrant memory.

---

## Global Rules System

### Dynamic Project Detection
All agent modes use **dynamic PROJECT_NAME detection** based on the workspace directory basename:

```
Current Workspace Directory: /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp
PROJECT_NAME = "qdrant-memory-mcp"
```

This eliminates hardcoded project names and enables seamless cross-project operation.

### Global Rules Location
Rules are stored globally in `~/.roo/rules-{mode}/memory.md`:
- `~/.roo/rules-architect/memory.md`
- `~/.roo/rules-code/memory.md`
- `~/.roo/rules-documentation-writer/memory.md`
- `~/.roo/rules-orchestrator/memory.md`

### Symlink Configuration
The global `roo-code-settings.json` is shared across all projects via symlink:
```
~/.roo/rules-code/settings/roo-code-settings.json 
  → /Users/dietrichgottfriedschmidt/Documents/Roo_Memory/manifests/roo-code-settings.json
```

This ensures all projects use the same agent configuration and memory system.

---

## Core Tools & Agent Instructions

### Context Retrieval (recall_context)
At the beginning of a new task or when opening a new workspace, the agent MUST use the `recall_context` tool to load current project patterns, architectural decisions, and existing code base context.

**Parameters:**
- `project`: Dynamically detected PROJECT_NAME (from workspace basename)
- `query`: Task description or specific context needed
- `limit`: Number of results to return (default: 5)

### Context Memorization (memorize_context)
Whenever a significant architectural decision is made, a complex bug is resolved, or a core file is created, the agent MUST invoke the `memorize_context` tool. This ensures the memory bank stays continuously up to date without human intervention.

**Parameters:**
- `content`: Markdown documentation of the decision/solution
- `project`: Dynamically detected PROJECT_NAME
- `tags`: Categorization tags (e.g., ["adr", "architecture", "phase-1"])

### Chunking Strategy
Data ingested into memory must use a recursive chunking strategy targeting 512 to 1024 token segments with a 10% to 20% overlap buffer to preserve semantic boundaries and code blocks.

---

## Tech Stack Dependencies

### Core Dependencies
- **Node.js & TypeScript** - Runtime and language
- **@modelcontextprotocol/sdk** - Streamable HTTP server implementation
- **@qdrant/js-client-rest** - Qdrant vector database client
- **@aws-sdk/client-bedrock-runtime** - AWS Bedrock LLM integration

### Development Dependencies
- **Docker & Docker Compose** - Local development environment
- **Ollama** - Local embedding model (nomic-embed-text)
- **TypeScript Compiler** - Type checking and compilation

---

## Recent Session Logs

### Session: 2026-04-23 - AnythingLLM Removal & Global Rules Migration

**Completed Phases:**

#### Phase 1: Global Rules Architecture Review ✓
- Identified hardcoded project names as maintenance debt
- Designed dynamic project detection using workspace basename
- Created ADR for global rules migration

#### Phase 2: Global Rules Migration ✓
- Created 4 global rule files in `~/.roo/rules-{mode}/memory.md`
- Implemented dynamic PROJECT_NAME detection
- Deleted project-local hardcoded rules
- All tests passed

#### Phase 3: AnythingLLM Removal ✓
- Removed AnythingLLM MCP server configuration
- Updated all 19 custom modes in roo-code-settings.json
- Replaced dual-source DSI with Qdrant-only DSI
- File verification: 0 AnythingLLM references

#### Phase 4: Cross-Project Validation ✓
- Verified qdrant-memory-mcp uses Qdrant exclusively
- Verified starstruck-claude uses Qdrant exclusively
- Confirmed symlink to shared roo-code-settings.json works
- Confirmed VSCode cache reload after restart

**Key Changes:**
- Removed all AnythingLLM references from roo-code-settings.json
- Updated 19 custom modes to use Qdrant exclusively
- Created global rules system with dynamic project detection
- Implemented symlink-based configuration sharing

**Verification Results:**
- ✓ 0 AnythingLLM references in configuration
- ✓ Both qdrant-memory-mcp and starstruck-claude projects verified
- ✓ Dynamic PROJECT_NAME detection working correctly
- ✓ recall_context calls working as expected

---

## Architecture Transformation Summary

| Component | Before | After |
|---|---|---|
| **Memory System** | AnythingLLM + Qdrant (dual-source) | Qdrant only (single-source) |
| **Rules Location** | Project-local (hardcoded per project) | Global (dynamic PROJECT_NAME) |
| **Project Detection** | Hardcoded in each project's rules | Dynamic from workspace basename |
| **DSI Protocol** | Dual-source (ROO_CODE_CONTEXT + AnythingLLM) | Single-source (ROO_CODE_CONTEXT + Qdrant) |
| **External Dependencies** | AnythingLLM service required | None (local Qdrant only) |
| **Maintenance Model** | N copies of 1 truth (per-project rules) | 1 source of truth (global rules) |
| **Network Latency** | External service calls | Local vector database only |

---

## Benefits Achieved

✓ **Eliminated External Dependency** - No AnythingLLM service required  
✓ **Reduced Network Latency** - Local Qdrant only  
✓ **Simplified DSI Protocol** - Single-source instead of dual-source  
✓ **Centralized Rules Management** - Global rules, not per-project  
✓ **Dynamic Project Detection** - No hardcoding required  
✓ **Easier Maintenance** - One rules file per mode, not N copies  
✓ **Cross-Project Consistency** - All projects use same configuration  
✓ **Verified Working** - Tested across multiple projects  

---

## Next Phases

### Phase 5: Apply Migration to Other Projects
Extend global rules to other projects (ahrqgov-drupal, pso-drupal, github-runner, etc.)

### Phase 6: Testing & Validation
Comprehensive testing of new architecture across all modes and projects

### Phase 7: Qdrant Memory Optimization
Optimize memory storage and retrieval patterns

### Phase 8: Monitoring & Observability
Add monitoring for Qdrant and agent operations

---

## Documentation References

- **ADR: Global Rules with Dynamic Project Detection** - Stored in Qdrant memory
- **Migration Summary: AnythingLLM Removal Complete** - Stored in Qdrant memory
- **Verification Guide: Cross-Project Qdrant Usage** - Stored in Qdrant memory
- **Global Rules Files** - Located in `~/.roo/rules-{mode}/memory.md`
- **Configuration** - Located in `/Users/dietrichgottfriedschmidt/Documents/Roo_Memory/manifests/roo-code-settings.json`

---

## Status

**Current:** ✓ PRODUCTION READY
- Migration complete and verified
- All projects using Qdrant exclusively
- Global rules system active
- Dynamic project detection working
- Cross-project validation passed

**Last Updated:** 2026-04-23  
**Migration Status:** COMPLETE  
**Verification Status:** PASSED
