# Qdrant-MCP: Hybrid Memory Architecture for AI Agents

A high-performance, production-ready memory system for AI agents combining Qdrant vector database with a custom Model Context Protocol (MCP) server. Designed for seamless local development and cloud deployment on AWS.

**Status:** ✓ Production Ready | **Phase:** 8a Local Monitoring Complete

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Monitoring](#monitoring)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

### What is Qdrant-MCP?

Qdrant-MCP is a headless, high-performance memory system that replaces traditional UI-heavy solutions like AnythingLLM. It provides:

- **Vector Database:** Qdrant for semantic search and retrieval
- **MCP Server:** Custom TypeScript implementation using the Model Context Protocol
- **Hybrid Embeddings:** Local Ollama for development, AWS Bedrock for production
- **Monitoring:** Prometheus + Grafana for local, CloudWatch for production
- **Scalability:** Docker Compose locally, AWS ECS/Fargate in production

### Key Features

✓ **Single Source of Truth:** Qdrant as exclusive memory backend  
✓ **Stateless HTTP Transport:** Modern MCP Streamable HTTP protocol  
✓ **Hybrid Embeddings:** Seamless switching between local and cloud providers  
✓ **Production Monitoring:** 9 metrics, 8 alert rules, auto-scaling  
✓ **Global Rules System:** Dynamic project detection, centralized configuration  
✓ **Cross-Project Consistency:** Unified agent behavior across projects  

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
│  │  MCP Server (stdio transport)                        │   │
│  │  - Reads from stdin                                  │   │
│  │  - Writes to stdout                                  │   │
│  │  - Metrics HTTP server on :9091                      │   │
│  │  - Accessible to Docker via host.docker.internal    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Agent
  │
  ├─→ memorize_context(content, project, tags)
  │   └─→ MCP Server
  │       ├─→ Chunk content (512-1024 tokens)
  │       ├─→ Generate embeddings (Ollama/Bedrock)
  │       ├─→ Store in Qdrant
  │       └─→ Emit metrics (mcp_chunks_stored_total++)
  │
  └─→ recall_context(project, query, limit)
      └─→ MCP Server
          ├─→ Generate query embedding
          ├─→ Search Qdrant (semantic similarity)
          ├─→ Return top-k results
          └─→ Emit metrics (mcp_recall_duration_seconds)
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Vector DB** | Qdrant | Semantic search & storage |
| **MCP Server** | TypeScript + Node.js | Tool implementation |
| **Local Embeddings** | Ollama (nomic-embed-text) | Development |
| **Cloud Embeddings** | AWS Bedrock Titan | Production |
| **Metrics** | Prometheus | Time-series collection |
| **Dashboards** | Grafana | Visualization |
| **Orchestration** | Docker Compose | Local development |
| **Cloud** | AWS ECS/Fargate | Production deployment |

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

### 3. Start MCP Server (on host)

```bash
cd mcp-server
npm install
npm start
```

Expected output:
```
Qdrant initialized successfully
MCP Server connected via stdio transport
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

All targets should show `"health": "up"` (except ollama which shows UNKNOWN).

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
# Install Node.js dependencies
cd mcp-server
npm install

# Install Docker (if not already installed)
# macOS: brew install docker
# Linux: Follow Docker documentation
```

#### 2. Configure Environment

```bash
# Copy environment template
cp mcp-server/.env.example mcp-server/.env

# Edit configuration
nano mcp-server/.env
```

#### 3. Build Docker Images

```bash
# Build MCP server image
docker build -t qdrant-memory-mcp-mcp-server:latest ./mcp-server

# Pull other images
docker pull qdrant/qdrant:latest
docker pull ollama/ollama:latest
docker pull prom/prometheus:latest
docker pull grafana/grafana:latest
```

#### 4. Initialize Qdrant Collection

```bash
# Qdrant will auto-initialize on first run
# Verify collection exists
curl http://localhost:6333/api/collections
```

---

## Configuration

### Environment Variables

**MCP Server** (`mcp-server/.env`):

```bash
# Qdrant Configuration
QDRANT_URL=http://qdrant-local:6333
QDRANT_COLLECTION=agent-memory

# Embedding Configuration
OLLAMA_URL=http://ollama-local:11434
OLLAMA_MODEL=nomic-embed-text:latest

# AWS Configuration (production)
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=amazon.titan-embed-text-v2:0

# MCP Configuration
MCP_PORT=3000
LOG_LEVEL=info
NODE_ENV=local
```

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
      - targets: ['host.docker.internal:9091']
    scrape_interval: 10s
    
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
```

---

## API Documentation

### MCP Tools

The MCP server exposes two primary tools:

#### 1. `memorize_context`

Store content in the memory system.

**Parameters:**
- `content` (string, required) — Content to store (markdown, code, documentation)
- `project` (string, required) — Project identifier (auto-detected from workspace)
- `tags` (array, optional) — Categorization tags (e.g., ["adr", "architecture", "phase-1"])

**Example:**

```typescript
await memorize_context({
  content: "# ADR: Global Rules Migration\n\nDecision: Migrate to dynamic project detection...",
  project: "qdrant-memory-mcp",
  tags: ["adr", "architecture", "phase-4"]
});
```

**Metrics Emitted:**
- `mcp_chunks_stored_total` (counter) — Incremented by number of chunks
- `mcp_memorize_duration_seconds` (histogram) — Operation latency
- `mcp_embedding_duration_seconds` (histogram) — Embedding generation time

#### 2. `recall_context`

Retrieve relevant content from memory.

**Parameters:**
- `project` (string, required) — Project identifier
- `query` (string, required) — Search query
- `limit` (number, optional) — Max results (default: 5)

**Example:**

```typescript
const results = await recall_context({
  project: "qdrant-memory-mcp",
  query: "How do we handle dynamic project detection?",
  limit: 3
});
```

**Response:**

```json
{
  "results": [
    {
      "id": "uuid-1",
      "content": "# ADR: Global Rules Migration...",
      "score": 0.92,
      "tags": ["adr", "architecture"],
      "project": "qdrant-memory-mcp"
    }
  ]
}
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
mcp_tool_calls_total — Total tool invocations
mcp_tool_errors_total — Total tool errors
mcp_chunks_stored_total — Chunks stored in Qdrant

# Histograms
mcp_recall_duration_seconds — Recall latency (p50, p95, p99)
mcp_memorize_duration_seconds — Memorize latency
mcp_embedding_duration_seconds — Embedding generation time

# Gauges
mcp_recall_score_avg — Average retrieval quality
mcp_projects_active — Active projects in memory
mcp_vectors_stored — Total vectors in Qdrant
```

---

## Monitoring

### Local Monitoring Stack

The project includes a complete monitoring setup for local development:

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

See [Phase 8b: Cloud Monitoring](docs/PHASE_8B_CLOUD_MONITORING.md) for production setup.

---

## Deployment

### Local Development

```bash
# 1. Start Docker stack
docker-compose up -d

# 2. Start MCP server
cd mcp-server && npm start

# 3. Access dashboards
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3002
```

### Production Deployment (AWS)

See [Deployment Guide](docs/DEPLOYMENT.md) for:
- ECS task definition
- Fargate configuration
- Load balancer setup
- Auto-scaling policies
- Secrets management
- CloudWatch integration

**Quick Deploy:**

```bash
# Build and push Docker image
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

---

## Contributing

### Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make Changes**
   - Follow TypeScript best practices
   - Add tests for new functionality
   - Update documentation

3. **Test Locally**
   ```bash
   npm run build
   npm run test
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

- **Language:** TypeScript
- **Linter:** ESLint
- **Formatter:** Prettier
- **Tests:** Jest
- **Documentation:** JSDoc comments

### Running Tests

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

---

## License

MIT License — See [LICENSE](LICENSE) file for details.

---

## Support & Resources

- **GitHub Issues:** https://github.com/dschmidtadv/qdrant-memory-mcp/issues
- **Documentation:** See `docs/` directory
- **Architecture Decisions:** See `.ai-memory/` directory

---

## Roadmap

- [x] Phase 8a: Local Monitoring Stack
- [ ] Phase 8b: Cloud Monitoring (AWS CloudWatch)
- [ ] Phase 9: Production Deployment (ECS/Fargate)
- [ ] Phase 10: Performance Optimization
- [ ] Phase 11: Security Hardening
- [ ] Phase 12: Documentation & Runbooks

---

**Last Updated:** 2026-04-24  
**Status:** Production Ready (Phase 8a)  
**Maintainer:** Dietrich Schmidt (@dschmidtadv)
