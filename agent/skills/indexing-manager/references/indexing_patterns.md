# Indexing Patterns Reference

## Overview

This document catalogs common indexing endpoint patterns and their specifications. Use this reference when configuring the `indexing-manager` skill for different indexing backends.

---

## 1. Local Handoff Service

**Use Case:** Local Docker-based indexing service for AnythingLLM integration

**Endpoint:** `http://127.0.0.1:5000/api/handoff`

**Configuration:**
```yaml
endpoint: http://127.0.0.1:5000/api/handoff
workspace_slug: example-project
```

**Request Format:**
```
POST /api/handoff
Content-Type: multipart/form-data

Fields:
  - file: (binary) Document content
  - project: (string) Project identifier
  - timestamp: (ISO 8601) Upload timestamp
```

**Response:**
```json
{
  "status": "success",
  "message": "Document indexed",
  "document_id": "doc-12345"
}
```

**Characteristics:**
- ✅ Local, low-latency
- ✅ No authentication required
- ✅ Supports concurrent uploads
- ⚠️ Requires Docker service running
- ⚠️ Single-machine deployment only

**Troubleshooting:**
- Service not responding: `docker-compose up -d handoff-service`
- Port conflict: Check `lsof -i :5000`

---

## 2. Qdrant MCP Server

**Use Case:** Direct integration with Qdrant via Model Context Protocol (MCP)

**Endpoint:** `http://localhost:3000/mcp`

**Configuration:**
```yaml
endpoint: http://localhost:3000/mcp
collection_name: agent-memory
```

**Request Format:**
```
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "memorize_context",
    "arguments": {
      "content": "<file_text>",
      "project": "qdrant-memory-mcp",
      "tags": ["session-log", "ai-memory"]
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": "Successfully stored 5 chunks in memory for project \"qdrant-memory-mcp\""
}
```

**Characteristics:**
- ✅ Native Qdrant vector database integration
- ✅ Automatic chunking and embedding via MCP
- ✅ No authentication required (local service)
- ✅ Semantic search via `recall_context` tool
- ✅ Project-scoped memory isolation

**Configuration:**
```yaml
# Add to indexing-manager.config.yaml
endpoint: http://localhost:3000/mcp
collection_name: agent-memory
```

---

## 3. Elasticsearch Bulk Indexing

**Use Case:** Index documents into Elasticsearch cluster

**Endpoint:** `http://elasticsearch:9200/_bulk`

**Configuration:**
```yaml
endpoint: http://elasticsearch:9200/_bulk
index_name: example-project-docs
```

**Request Format:**
```
POST /_bulk
Content-Type: application/x-ndjson

{ "index": { "_index": "example-project-docs", "_id": "doc-1" } }
{ "title": "filename.md", "content": "...", "timestamp": "2026-04-17T..." }
```

**Response:**
```json
{
  "took": 123,
  "errors": false,
  "items": [
    {
      "index": {
        "_index": "example-project-docs",
        "_id": "doc-1",
        "_version": 1,
        "result": "created"
      }
    }
  ]
}
```

**Characteristics:**
- ✅ High-performance bulk indexing
- ✅ Full-text search capabilities
- ⚠️ Requires Elasticsearch cluster
- ⚠️ Complex query syntax

---

## 4. Milvus Vector Database

**Use Case:** Index documents as vectors for semantic search

**Endpoint:** `http://milvus:19530/v1/documents/insert`

**Configuration:**
```yaml
endpoint: http://milvus:19530/v1/documents/insert
collection_name: example-project
```

**Request Format:**
```
POST /v1/documents/insert
Content-Type: application/json

{
  "collection_name": "example-project",
  "records": [
    {
      "id": "doc-1",
      "text": "Document content...",
      "embedding": [0.123, 0.456, ...],
      "metadata": {
        "filename": "file.md",
        "timestamp": "2026-04-17T..."
      }
    }
  ]
}
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "insert_count": 1,
    "ids": ["doc-1"]
  }
}
```

**Characteristics:**
- ✅ Semantic search via embeddings
- ✅ Scalable vector indexing
- ⚠️ Requires embedding model
- ⚠️ Higher computational overhead

---

## 5. Pinecone Cloud Vector Store

**Use Case:** Cloud-hosted vector database for semantic search

**Endpoint:** `https://api.pinecone.io/v1/documents`

**Configuration:**
```yaml
endpoint: https://api.pinecone.io/v1/documents
api_key: ${PINECONE_API_KEY}
index_name: example-project
```

**Request Format:**
```
POST /v1/documents
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "vectors": [
    {
      "id": "doc-1",
      "values": [0.123, 0.456, ...],
      "metadata": {
        "filename": "file.md",
        "text": "Document content...",
        "project": "example-project"
      }
    }
  ]
}
```

**Response:**
```json
{
  "upserted_count": 1
}
```

**Characteristics:**
- ✅ Fully managed cloud service
- ✅ No infrastructure overhead
- ✅ Global availability
- ⚠️ Requires API key
- ⚠️ Pricing based on usage

---

## Endpoint Selection Guide

| Use Case | Endpoint | Latency | Cost | Complexity |
|----------|----------|---------|------|-----------|
| Local development (recommended) | Qdrant MCP Server | <50ms | Free | Low |
| Legacy local development | Handoff Service | <100ms | Free | Low |
| Full-text search | Elasticsearch | 50-200ms | Medium | High |
| Semantic search | Milvus | 100-500ms | Medium | High |
| Cloud semantic search | Pinecone | 200-1000ms | High | Low |

---

## Configuration Examples

### Example 1: Local Development (Qdrant MCP Server - Recommended)
```yaml
project: qdrant-memory-mcp
memory_dir: .ai-memory
endpoint: http://localhost:3000/mcp
collection_name: agent-memory
concurrency: 3
retry_max: 3
```

### Example 2: Legacy Local Development (Handoff Service)
```yaml
project: example-project
memory_dir: .ai-memory
endpoint: http://127.0.0.1:5000/api/handoff
concurrency: 3
retry_max: 3
```

### Example 3: Semantic Search (Pinecone)
```yaml
project: example-project
memory_dir: .ai-memory
endpoint: https://api.pinecone.io/v1/documents
api_key: ${PINECONE_API_KEY}
index_name: example-project
concurrency: 10
retry_max: 3
```

---

## Performance Benchmarks

| Endpoint | Throughput | Latency | Notes |
|----------|-----------|---------|-------|
| Qdrant MCP Server | 50-100 files/min | 0.5-1s/file | Local, MCP JSON-RPC, automatic chunking |
| Handoff Service | 30-50 files/min | 1-2s/file | Local, no network overhead |
| Elasticsearch | 100-200 files/min | 0.5-1s/file | Bulk indexing, high throughput |
| Milvus | 20-40 files/min | 2-5s/file | Embedding computation overhead |
| Pinecone | 10-30 files/min | 3-10s/file | Cloud latency, API rate limits |

---

## Related Documentation

- [`error_recovery.md`](indexing-manager-error-recovery.md) — Troubleshooting guide
- [`api_specifications.md`](indexing-manager-api-specifications.md) — Technical reference
- [`INDEXING-MANAGER-SKILL.md`](INDEXING-MANAGER-SKILL.md) — Main skill documentation
