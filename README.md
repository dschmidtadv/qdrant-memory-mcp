# Qdrant-MCP: Hybrid Memory Architecture for AI Agents

A high-performance, production-ready memory system for AI agents combining Qdrant vector database with a custom Model Context Protocol (MCP) server. Designed for seamless local development and cloud deployment on AWS.

**Status:** ✓ Phase 8a Complete | **Current Work:** Phase 7 — Qdrant Error Handling & Retry Logic (planning) | **Last Updated:** 2026-04-29

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Developer Setup](#developer-setup)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Monitoring](#monitoring)
- [Deployment](#deployment)
- [Agent Integration (Dual-Brain Workflow)](#agent-integration-dual-brain-workflow)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

### What is Qdrant-MCP?

Qdrant-MCP is a headless, high-performance memory system that replaces traditional UI-heavy solutions like AnythingLLM. It provides:

- **Vector Database:** Qdrant for semantic search and retrieval
- **MCP Server:** Custom TypeScript implementation using the Model Context Protocol
- **Hybrid Embeddings:** Local Ollama (768-dim) for development, AWS Bedrock Titan v2 (1024-dim) for production
- **Dual Transport:** `stdio` for local IDE integration, `http` for cloud Fargate deployment
- **Monitoring:** Prometheus + Grafana locally, CloudWatch in production
- **Scalability:** Docker Compose locally, AWS ECS/Fargate in production

### Key Features

✓ **Single Source of Truth:** Qdrant as exclusive memory backend (AnythingLLM fully removed)
✓ **Dual Transport:** `TRANSPORT_MODE=stdio` (default, IDE) or `TRANSPORT_MODE=http` (cloud ALB)
✓ **Hybrid Embeddings:** Seamless switching between local Ollama (768-dim) and AWS Bedrock (1024-dim)
✓ **Environment-Aware Collections:** `agent-memory` (local) vs `agent-memory-prod` (production)
✓ **Production Monitoring:** 9 metrics, 8 alert rules, Prometheus + Grafana dashboards
✓ **Global Rules System:** Dynamic project detection, centralized agent configuration
✓ **Dual-Brain Agent Workflow:** GitNexus (structural) + Qdrant (semantic) memory integration

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Network: qdrant-mcp-network                         │
│                                                              │
│  ┌──────────────┐   /metrics   ┌──────────────────────────┐ │
│  │ qdrant-local │ ──────────── │  prometheus              │ │
│  │ :6333        │              │  :9090                   │ │
│  └──────────────┘              │                          │ │
│                                │  Scrape targets:         │ │
│  ┌──────────────┐   /api/tags  │  - qdrant-local:6333     │ │
│  │ ollama-local │ ──────────── │  - ollama-local:11434    │ │
│  │ :11434       │              │  - host.docker.internal  │ │
│  └──────────────┘              │    :9091 (MCP server)    │ │
│                                └──────────────────────────┘ │
│                                           │                  │
│                                ┌──────────▼───────────────┐ │
│                                │  grafana                 │ │
│                                │  :3002                   │ │
│                                │                          │ │
│                                │  Dashboards:             │ │
│                                │  - Qdrant Health         │ │
│                                │  - MCP Performance       │ │
│                                │  - Embedding Latency     │ │
│                                │  - Memory Usage          │ │
│                                └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  HOST MACHINE (macOS/Linux)                                  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  MCP Server (stdio transport — default)              │   │
│  │  - Reads from stdin / writes to stdout               │   │
│  │  - Metrics HTTP server on :9091                      │   │
│  │  - Accessible to Docker via host.docker.internal     │   │
│  │                                                      │   │
│  │  Set TRANSPORT_MODE=http for cloud/ALB mode          │   │
│  │  (exposes POST /mcp endpoint on MCP_PORT=3000)       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Agent
  │
  ├─→ memorize_context(content, project, tags)
  │   └─→ MCP Server
  │       ├─→ Chunk content (512-1024 tokens, 10-20% overlap)
  │       ├─→ Generate embeddings (Ollama 768-dim / Bedrock 1024-dim)
  │       ├─→ Store in Qdrant (agent-memory / agent-memory-prod)
  │       └─→ Emit metrics (mcp_chunks_stored_total++)
  │
  └─→ recall_context(project, query, limit)
      └─→ MCP Server
          ├─→ Generate query embedding
          ├─→ Search Qdrant (HNSW cosine similarity + project filter)
          ├─→ Return top-k results as Markdown
          └─→ Emit metrics (mcp_recall_duration_seconds)
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Vector DB** | Qdrant | Semantic search & storage |
| **MCP Server** | TypeScript + Node.js | Tool implementation |
| **Local Embeddings** | Ollama (nomic-embed-text, 768-dim) | Development |
| **Cloud Embeddings** | AWS Bedrock Titan v2 (1024-dim) | Production |
| **Metrics** | Prometheus + prom-client | Time-series collection |
| **Dashboards** | Grafana | Visualization |
| **Orchestration** | Docker Compose | Local development |
| **Cloud** | AWS ECS/Fargate + EFS | Production deployment |
| **Code Intelligence** | GitNexus | Structural memory / blast-radius analysis |

### Transport Architecture

The MCP server supports two transport modes, selected via the `TRANSPORT_MODE` environment variable:

| Mode | Value | Use Case | How it works |
|------|-------|----------|--------------|
| **stdio** (default) | `TRANSPORT_MODE=stdio` | Local IDE (Claude, Cursor, VSCode) | Process-level stdin/stdout — direct IDE integration |
| **http** | `TRANSPORT_MODE=http` | AWS Fargate / ALB | POST `/mcp` endpoint on `MCP_PORT` (default 3000) |

> **Note:** The HTTP transport (`TRANSPORT_MODE=http`) is scaffolded in
> `mcp-server/src/transports/http-transport.ts` but is not yet production-complete.
> Full Streamable HTTP implementation is planned for Phase 9 (cloud deployment).

### Why MCP Server is NOT Containerized (Local Development)

The MCP server runs on the **host machine** rather than in a Docker container for local use:

1. **Stdio Transport Requirement** — IDE clients communicate via stdin/stdout, which requires host-level process access
2. **Fast Iteration** — No Docker rebuild on code changes; `npm run build && npm start` is sufficient
3. **Metrics Accessibility** — Prometheus scrapes `:9091` via `host.docker.internal` without complex port mapping
4. **Separation of Concerns** — Stateful infrastructure (Qdrant, Ollama, Prometheus, Grafana) is containerized; the stateless MCP server runs on the host

When deployed to **AWS Fargate**, the MCP server will be containerized and use `TRANSPORT_MODE=http`.

### Environment-Aware Configuration

| Setting | Local (`NODE_ENV=local`) | Production (`NODE_ENV=production`) |
|---------|--------------------------|-------------------------------------|
| **Embedding provider** | Ollama (`nomic-embed-text`) | AWS Bedrock (`amazon.titan-embed-text-v2:0`) |
| **Vector dimensions** | 768 | 1024 |
| **Qdrant collection** | `agent-memory` | `agent-memory-prod` |
| **Transport** | stdio | http |

---

## Quick Start

### Prerequisites

- Docker Desktop (macOS/Linux) or Docker Engine
- Node.js 20+
- Git

### 1. Clone Repository

```bash
git clone https://github.com/dschmidtadv/qdrant-memory-mcp.git
cd qdrant-memory-mcp
```

### 2. Start Docker Stack

```bash
docker-compose up -d
```

Verify all services are running:

```bash
docker-compose ps
```

Expected output:
```
NAME              STATUS
qdrant-local      Up (healthy)
ollama-local      Up (health: starting)
prometheus        Up
grafana           Up
```

### 3. Build and Start MCP Server (on host)

```bash
cd mcp-server
npm install
npm run build   # Required: compiles TypeScript to dist/
npm start
```

Expected output:
```
Connecting to Qdrant at: http://localhost:6333
Environment: local
Collection: agent-memory (768-dim)
Qdrant initialized successfully
Transport mode: stdio
MCP Server connected via stdio transport (local IDE mode)
Metrics server listening on :9091
```

### 4. Access Dashboards

- **Prometheus:** http://localhost:9090
- **Grafana:** http://localhost:3002 (admin/admin)
- **MCP Metrics:** http://localhost:9091/metrics

### 5. Verify Prometheus Targets

```bash
curl http://localhost:9090/api/v1/targets
```

All targets should show `"health": "up"` (Ollama may show UNKNOWN until a model is pulled).

---

## Developer Setup

### Automated Setup for New Developers

When cloning this repository for the first time, you need to bridge the `agent/rules-*/` folders into your VS Code global storage via symlinks. This enables seamless integration with the Roo agent system.

#### Quick Setup (Recommended)

```bash
# Run the automated setup script
make install-modes
```

This single command will:
1. ✓ Detect your VS Code global storage path
2. ✓ Create symlinks from `agent/rules-*/` to `~/.roo/rules-*/`
3. ✓ Validate all symlinks
4. ✓ Provide clear feedback

#### Manual Setup

If you prefer to run the setup script directly:

```bash
# Make the script executable
chmod +x scripts/setup-auto-start.sh

# Run the setup script
./scripts/setup-auto-start.sh
```

#### What Gets Installed

The setup script creates symlinks for all `rules-*` directories in the `agent/` folder:

```
agent/rules-code/          → ~/.roo/rules-code/
agent/rules-architect/     → ~/.roo/rules-architect/
agent/rules-orchestrator/  → ~/.roo/rules-orchestrator/
... (and any other rules-* directories)
```

These symlinks enable VS Code to access agent configuration and rules globally across all projects.

#### Verification

To verify the setup was successful:

```bash
# Check symlink status
make validate-symlinks

# Or manually verify
ls -la ~/.roo/rules-*/
```

Expected output:
```
~/.roo/rules-code -> /path/to/qdrant-memory-mcp/agent/rules-code
~/.roo/rules-architect -> /path/to/qdrant-memory-mcp/agent/rules-architect
```

#### Troubleshooting

**Symlinks not created?**
- Ensure `agent/rules-*/` directories exist
- Check that `~/.roo/` directory is writable
- Run `make install-modes` again with verbose output

**VS Code not recognizing changes?**
- Restart VS Code completely
- Check that symlinks point to correct locations: `readlink ~/.roo/rules-code`
- Verify VS Code global storage path: `~/Library/Application Support/Code/User/globalStorage` (macOS) or `~/.config/Code/User/globalStorage` (Linux)

**Need to clean up?**

```bash
# Remove all symlinks from ~/.roo/
make clean-symlinks
```

#### Available Make Targets

```bash
make help              # Display all available targets
make install-modes     # Run setup and validate symlinks (recommended)
make validate-symlinks # Check symlink status
make clean-symlinks    # Remove all symlinks from ~/.roo/
```

---

## Installation

### System Requirements

**Local Development:**
- 4GB RAM minimum (8GB recommended)
- 10GB disk space
- Docker Desktop with 4 CPU cores

**Production (AWS):**
- ECS Fargate task: 2 vCPU, 4GB memory
- EFS for Qdrant persistence
- ALB for load balancing

### Step-by-Step Installation

#### 1. Install Dependencies

```bash
cd mcp-server
npm install
```

#### 2. Configure Environment

```bash
# Copy environment template
cp mcp-server/.env.example mcp-server/.env

# Edit configuration
nano mcp-server/.env
```

#### 3. Build MCP Server

```bash
cd mcp-server
npm run build
```

#### 4. Pull Docker Images

```bash
docker pull qdrant/qdrant:latest
docker pull ollama/ollama:latest
docker pull prom/prometheus:latest
docker pull grafana/grafana:latest
```

#### 5. Initialize Qdrant Collection

Qdrant auto-initializes the `agent-memory` collection on first MCP server start. Verify:

```bash
curl http://localhost:6333/collections
```

---

## Configuration

### Environment Variables

**MCP Server** (`mcp-server/.env`):

```bash
# Runtime environment — controls embedding provider, vector dimensions, and collection name
NODE_ENV=local                              # "local" or "production"

# Transport — controls how the MCP server communicates
TRANSPORT_MODE=stdio                        # "stdio" (IDE) or "http" (cloud/ALB)
MCP_PORT=3000                               # HTTP port (only used when TRANSPORT_MODE=http)

# Qdrant Configuration
QDRANT_URL=http://localhost:6333            # Use http://qdrant-local:6333 inside Docker
QDRANT_COLLECTION=agent-memory             # Overrides auto-detected collection name

# Embedding Configuration (local)
OLLAMA_URL=http://localhost:11434           # Use http://ollama-local:11434 inside Docker
OLLAMA_MODEL=nomic-embed-text:latest

# AWS Configuration (production — NODE_ENV=production)
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=amazon.titan-embed-text-v2:0

# Logging
LOG_LEVEL=info
```

> **Important:** `TRANSPORT_MODE` defaults to `stdio` if not set. Set it to `http` only for
> cloud deployments behind an ALB. The HTTP transport is not yet production-complete.

### Docker Compose Configuration

**Key Services** (`docker-compose.yml`):

```yaml
services:
  qdrant-local:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - ./qdrant_data:/qdrant/storage
    mem_limit: 4g

  ollama-local:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ./ollama_data:/root/.ollama
    mem_limit: 2g

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3002:3000"
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
```

### Prometheus Configuration

**Scrape Targets** (`monitoring/prometheus/prometheus.yml`):

```yaml
scrape_configs:
  - job_name: 'qdrant'
    static_configs:
      - targets: ['qdrant-local:6333']
    scrape_interval: 15s

  - job_name: 'mcp-server'
    static_configs:
      - targets: ['host.docker.internal:9091']   # MCP server runs on host
    scrape_interval: 10s

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
```

> **Linux note:** `host.docker.internal` requires `--add-host=host.docker.internal:host-gateway`
> on native Linux Docker Engine (not needed on Docker Desktop for macOS/Windows).

---

## API Documentation

### MCP Tools

The MCP server exposes two primary tools:

#### 1. `memorize_context`

Store content in the memory system.

**Parameters:**
- `content` (string, required) — Content to store (markdown, code, documentation)
- `project` (string, required) — Project identifier (auto-detected from workspace basename)
- `tags` (array, optional) — Categorization tags (e.g., `["adr", "architecture", "phase-7"]`)

**Example:**

```typescript
await memorize_context({
  content: "# ADR: Global Rules Migration\n\nDecision: Migrate to dynamic project detection...",
  project: "qdrant-memory-mcp",
  tags: ["adr", "architecture", "phase-4"]
});
```

**Response:** Plain text confirmation string, e.g.:
```
Successfully stored 3 chunks in memory for project "qdrant-memory-mcp"
```

**Metrics Emitted:**
- `mcp_chunks_stored_total` (counter) — Incremented by number of chunks
- `mcp_memorize_duration_seconds` (histogram) — Operation latency
- `mcp_embedding_duration_seconds` (histogram) — Embedding generation time

#### 2. `recall_context`

Retrieve relevant content from memory.

**Parameters:**
- `project` (string, required) — Project identifier
- `query` (string, required) — Natural language search query
- `limit` (number, optional) — Max results (default: 5)
- `tags` (array, optional) — Filter by tags

**Example:**

```typescript
const results = await recall_context({
  project: "qdrant-memory-mcp",
  query: "How do we handle dynamic project detection?",
  limit: 3
});
```

**Response:** Markdown-formatted string:

```markdown
# Retrieved Context for "How do we handle dynamic project detection?"

## Result (Score: 0.92)
**Source:** memorize_context
**Tags:** adr, architecture
**Timestamp:** 2026-04-23T...

# ADR: Global Rules Migration
...
```

**Metrics Emitted:**
- `mcp_tool_calls_total` (counter) — Incremented by 1
- `mcp_recall_duration_seconds` (histogram) — Query latency
- `mcp_recall_score_avg` (gauge) — Average similarity score

### Metrics Endpoint

**URL:** `http://localhost:9091/metrics`

**Format:** Prometheus text format

**Available Metrics:**

```
# Counters
mcp_tool_calls_total          — Total tool invocations
mcp_tool_errors_total         — Total tool errors
mcp_chunks_stored_total       — Chunks stored in Qdrant

# Histograms
mcp_recall_duration_seconds   — Recall latency (p50, p95, p99)
mcp_memorize_duration_seconds — Memorize latency
mcp_embedding_duration_seconds — Embedding generation time

# Gauges
mcp_recall_score_avg          — Average retrieval quality
mcp_projects_active           — Active projects in memory
mcp_vectors_stored            — Total vectors in Qdrant
```

---

## Monitoring

### Local Monitoring Stack

The project includes a complete monitoring setup for local development (Phase 8a complete):

#### Prometheus

**URL:** http://localhost:9090

**Features:**
- Scrapes Qdrant, Ollama, MCP server, and itself
- 15-day data retention
- 8 alert rules configured
- Query interface for PromQL

**Key Queries:**

```promql
# MCP tool call rate
rate(mcp_tool_calls_total[5m])

# Recall latency p99
histogram_quantile(0.99, mcp_recall_duration_seconds_bucket)

# Qdrant memory usage
qdrant_memory_usage_bytes

# Error rate
rate(mcp_tool_errors_total[5m]) / rate(mcp_tool_calls_total[5m])
```

#### Grafana

**URL:** http://localhost:3002 (admin/admin)

**Dashboards:**
- **Qdrant Health** — Vector DB status, memory, disk
- **MCP Performance** — Tool calls, latency, errors
- **Embedding Latency** — Provider comparison (Ollama vs Bedrock)
- **Memory Usage** — System resource utilization

#### Alert Rules

**Critical (P1):**
- `QdrantDown` — Qdrant unreachable > 1 min
- `MCPServerDown` — MCP server unreachable > 30s

**Warning (P2):**
- `RecallLatencyHigh` — p99 > 500ms for 5 min
- `EmbeddingLatencyHigh` — p99 > 200ms for 5 min
- `ToolErrorRateHigh` — error rate > 1% for 5 min
- `QdrantMemoryHigh` — memory > 90% for 10 min
- `QdrantDiskHigh` — disk > 80% for 30 min
- `OllamaDown` — Ollama unreachable > 1 min

### Production Monitoring (AWS CloudWatch)

Cloud monitoring (Phase 8b) is planned. See `.ai-memory/PHASE_8A_TESTING_REPORT.md` for current observability status.

---

## Deployment

### Local Development

```bash
# 1. Start Docker stack
docker-compose up -d

# 2. Build and start MCP server (stdio mode — default)
cd mcp-server && npm run build && npm start

# 3. Access dashboards
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3002
# Metrics:    http://localhost:9091/metrics
```

### Production Deployment (AWS ECS/Fargate)

The production architecture uses:
- **AWS ECS Fargate** — Compute (no Ollama sidecar; Bedrock handles embeddings natively)
- **AWS EFS** — Persistent storage for Qdrant data across task lifecycle events
- **AWS ALB** — Routes HTTP traffic to the MCP server's `/mcp` endpoint
- **AWS Bedrock Titan v2** — 1024-dim embeddings (no CPU bottleneck)

**Environment variables for production:**

```bash
NODE_ENV=production
TRANSPORT_MODE=http
QDRANT_URL=http://<qdrant-fargate-service>:6333
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=amazon.titan-embed-text-v2:0
MCP_PORT=3000
```

**Build and push Docker image:**

```bash
docker build -t qdrant-memory-mcp-mcp-server:latest ./mcp-server
docker tag qdrant-memory-mcp-mcp-server:latest \
  <AWS_ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/qdrant-memory-mcp:latest
docker push <AWS_ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/qdrant-memory-mcp:latest

# Deploy to ECS
aws ecs update-service \
  --cluster qdrant-memory-mcp \
  --service mcp-server \
  --force-new-deployment
```

> **Note:** Full HTTP transport implementation (Phase 9) is required before production deployment.
> The current `TRANSPORT_MODE=http` stub returns a placeholder response.

---

## Agent Integration (Dual-Brain Workflow)

This project uses a **dual-brain memory architecture** for AI agents:

### Brain 1: GitNexus (Structural Memory)

Indexed at `.gitnexus/` — maps the AST of the codebase (316 symbols, 351 relationships, 2 execution flows).

**Use for:**
- Impact analysis before modifying any function or class
- Finding call chains and class dependencies
- Renaming symbols safely across the codebase

```bash
# Always run before editing a symbol
gitnexus_impact({ target: "symbolName", direction: "upstream" })
```

### Brain 2: Qdrant-MCP (Semantic Memory)

Collection: `agent-memory` — stores architectural decisions, ADRs, and non-code context.

**Use for:**
- Retrieving ADRs and historical decisions
- Understanding YAML service definitions and Drupal wiring
- Loading project rules at task start

```typescript
recall_context({ project: "qdrant-memory-mcp", query: "your query here", limit: 5 })
```

### Dual-Brain Decision Matrix

| Question | Brain | Tool |
|----------|-------|------|
| "What calls this function?" | GitNexus | `gitnexus_impact()` |
| "What was the ADR for this decision?" | Qdrant | `recall_context()` |
| "Which files break if I change this method?" | GitNexus | `gitnexus_impact()` |
| "What is the retry logic design?" | Qdrant | `recall_context()` |

### Global Rules System

Agent modes use **dynamic `PROJECT_NAME` detection** based on the workspace directory basename:

```
Workspace: /Users/<user>/apps/qdrant-memory-mcp
PROJECT_NAME = "qdrant-memory-mcp"
```

Global rules are stored in `~/.roo/rules-{mode}/memory.md` and shared via a symlink to:
```
/Users/<user>/Documents/Roo_Memory/manifests/roo-code-settings.json
```

This enables seamless cross-project operation without hardcoded project names.

---

## Contributing

### Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make Changes**
   - Follow TypeScript best practices
   - Run impact analysis before modifying shared symbols: `gitnexus_impact()`
   - Add tests for new functionality
   - Update documentation

3. **Build and Test Locally**
   ```bash
   cd mcp-server
   npm run build
   npm start
   ```

4. **Commit & Push**
   ```bash
   git add .
   git commit -m "feat: description of changes"
   git push origin feature/your-feature
   ```

5. **Create Pull Request**
   - Link to GitHub issue
   - Describe changes and testing
   - Request review

### Code Standards

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 20+
- **Linter:** ESLint
- **Formatter:** Prettier
- **Documentation:** JSDoc comments

---

## Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Local Infrastructure (Qdrant + Ollama) | ✅ Complete |
| Phase 2 | Hybrid MCP Server (TypeScript) | ✅ Complete |
| Phase 3 | RooCode LLM Configuration | ✅ Complete |
| Phase 4 | AI Agent Custom Instructions | ✅ Complete |
| Phase 5 | Data Migration (AnythingLLM → Qdrant) | ✅ Complete |
| Phase 6 | Testing & Validation | ✅ Complete |
| Phase 7 | Qdrant Error Handling & Retry Logic | 🔄 In Planning |
| Phase 8a | Local Monitoring Stack (Prometheus + Grafana) | ✅ Complete |
| Phase 8b | Cloud Monitoring (AWS CloudWatch) | ⏳ Planned |
| Phase 9 | Production Deployment (ECS/Fargate + HTTP transport) | ⏳ Planned |
| Phase 10 | Performance Optimization | ⏳ Planned |
| Phase 11 | Security Hardening | ⏳ Planned |
| Phase 12 | Documentation & Runbooks | ⏳ Planned |

---

## Support & Resources

- **GitHub Issues:** https://github.com/dschmidtadv/qdrant-memory-mcp/issues
- **Architecture Decisions:** See `.ai-memory/` directory
- **Agent Integration Guide:** See `.ai-memory/GITNEXUS_MCP_INTEGRATION.md`
- **Project Rules:** See `AGENTS.md` and `CLAUDE.md`

---

## License

MIT License — See [LICENSE](LICENSE) file for details.

---

**Last Updated:** 2026-04-29
**Status:** Phase 8a Complete — Phase 7 (Retry Logic) In Planning
**Maintainer:** Dietrich Schmidt (@dschmidtadv)
