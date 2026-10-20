# Embedding Service Troubleshooting Guide

## Overview

The embedding service is powered by **Ollama** and generates vector embeddings using the `nomic-embed-text:latest` model. This guide covers common issues and how to resolve them.

---

## Quick Diagnosis

Run the diagnostic tool to get a complete health check:

```bash
./scripts/diagnose-embedding-service.sh diagnose
```

This will check:
- ✓ Ollama container status
- ✓ Service connectivity
- ✓ Model availability
- ✓ Embedding generation capability
- ✓ Integration with Qdrant and MCP server

---

## Common Issues and Solutions

### 1. "Model not found" Errors

**Symptom:** `model "nomic-embed-text:latest" not found, try pulling it first`

**Root Cause:** The embedding model has not been downloaded to the Ollama container.

**Solution:**

```bash
# Option A: Automatic (recommended)
./scripts/diagnose-embedding-service.sh restart

# Option B: Manual pull
./scripts/diagnose-embedding-service.sh pull-model

# Option C: Docker command
docker exec ollama-local ollama pull nomic-embed-text:latest
```

**First-Time Setup:** If you're starting the service for the first time, the model must be pulled before use. With the updated docker-compose.yml, this happens automatically on container startup.

---

### 2. Ollama Service Not Responding

**Symptom:** `ECONNREFUSED` or `timeout` errors when calling embedding endpoints

**Root Cause:** Ollama container is not running or not ready.

**Solution:**

```bash
# Check container status
docker ps | grep ollama-local

# Restart the service
./scripts/diagnose-embedding-service.sh restart

# Or manually restart
docker restart ollama-local
```

---

### 3. Slow Embedding Generation

**Symptom:** Embedding requests take >10 seconds per batch

**Root Cause:** 
- Model is being loaded into memory (happens on first request)
- Resource constraints (insufficient CPU/memory allocated)
- Batch size too large for available resources

**Solution:**

```bash
# Check container resource limits
docker stats ollama-local

# If memory is constrained, check docker-compose.yml:
# Current allocation: mem_limit: 2g, cpus: 1.5

# First embedding in a batch is slower (model loading)
# Subsequent embeddings are faster (cached model)
```

**Batch Processing Tips:**
- The MCP server processes embeddings in batches of 5 (see [`mcp-server/src/tools.ts`](../../mcp-server/src/tools.ts:132))
- Each batch waits for all 5 to complete before moving to the next batch
- Rate limiting: Bedrock embeddings (production) are batched to respect API limits

---

### 4. Memory or Disk Space Issues

**Symptom:** OOM kills, container crashes, or "no space left on device" errors

**Root Cause:**
- Insufficient memory allocated to Ollama
- Large number of embeddings consuming memory
- Volume storage full

**Solution:**

```bash
# Check Ollama memory usage
docker stats ollama-local

# Check disk space
df -h ./ollama_data

# View logs for OOM events
docker logs ollama-local | grep -i "oom\|memory"

# If out of space, clean up old model cache
docker exec ollama-local rm -rf /root/.ollama/models/*
# Then re-pull the model
./scripts/diagnose-embedding-service.sh pull-model
```

---

### 5. Embeddings Have Wrong Dimension

**Symptom:** Validation errors like `Expected 768-dimensional vector, got 1024`

**Root Cause:** 
- Environment-specific dimension mismatch (local vs. production)
- Mixed use of Ollama (local, 768-dim) and Bedrock (production, 1024-dim)

**Solution:**

```bash
# Check which embedding provider is active
echo $NODE_ENV  # Should be "local" or "production"

# Local development: Uses Ollama, generates 768-dim vectors
# Production deployment: Uses AWS Bedrock, generates 1024-dim vectors

# Validate vector dimension
curl -s -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text:latest","prompt":"test"}' | jq '.embedding | length'
# Should return 768
```

See [`mcp-server/src/embedding.ts`](../../mcp-server/src/embedding.ts) for details.

---

### 6. Connection Refused on Port 11434

**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:11434`

**Root Cause:**
- Ollama container is not running
- Port is bound to a different service
- Docker network misconfiguration

**Solution:**

```bash
# Verify Ollama is running
docker ps | grep ollama-local

# Check port binding
lsof -i :11434  # macOS/Linux
netstat -anp | grep 11434  # Linux

# If another service is using the port, stop it or change Ollama's port in docker-compose.yml

# Verify container can reach the service
docker exec ollama-local curl -s http://localhost:11434/api/tags | jq '.' | head -10
```

---

### 7. Qdrant Integration Failing

**Symptom:** Vectors are generated but not stored in Qdrant

**Root Cause:**
- Qdrant is not running or not accessible from MCP server
- Vector dimension mismatch between embedding and Qdrant schema
- Qdrant collection misconfigured

**Solution:**

```bash
# Check Qdrant status
./scripts/diagnose-embedding-service.sh diagnose  # Includes Qdrant check

# Verify Qdrant is reachable from MCP container
docker exec <mcp-container-id> curl -s http://qdrant-local:6333/health | jq '.'

# Check Qdrant collections and their vector dimensions
curl -s http://localhost:6333/collections | jq '.result.collections'

# Verify MCP server logs
docker logs <mcp-container-id> | grep -i "upsert\|qdrant"
```

---

## Testing & Validation

### Test Embedding Generation

```bash
./scripts/diagnose-embedding-service.sh test
```

Expected output: 768-dimensional vector for local testing.

### Manual API Test

```bash
# Test Ollama embeddings directly
curl -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nomic-embed-text:latest",
    "prompt": "Test embedding generation"
  }' | jq '.embedding[0:5]'
```

Expected output: Array of 5 numbers (first 5 dimensions).

---

## Performance Tuning

### Batch Size

The MCP server batches embedding requests to the Ollama service. Default batch size is **5 requests in parallel**. This can be tuned in [`mcp-server/src/tools.ts:132`](../../mcp-server/src/tools.ts:132).

**Increase batch size for:**
- High-throughput scenarios
- Sufficient CPU/memory resources

**Decrease batch size for:**
- Low-resource environments
- Real-time latency requirements

### Resource Allocation

Docker Compose allocation (in `docker-compose.yml`):
```yaml
ollama-local:
  mem_limit: 2g           # Hard cap
  mem_reservation: 1g     # Soft reservation
  cpus: 1.5               # CPU allocation
```

Adjust these based on your system capacity.

---

## Monitoring & Metrics

The MCP server exports Prometheus metrics on port **9091**:

```bash
curl http://localhost:9091/metrics | grep embedding
```

Key metrics:
- `embedding_duration_seconds` — Time to generate embeddings
- `embedding_errors_total` — Failed embedding requests
- `chunks_stored_total` — Vectors successfully stored

---

## Logs & Debugging

### View Ollama Logs

```bash
./scripts/diagnose-embedding-service.sh logs

# Or manually
docker logs ollama-local

# Follow logs in real-time
docker logs -f ollama-local
```

### View MCP Server Logs

```bash
docker logs <mcp-container-id>
```

### Enable Debug Logging

Set environment variable in docker-compose.yml or your terminal:

```bash
export DEBUG=ollama:*
docker-compose up ollama-local
```

---

## Automatic Model Initialization (New in This Release)

Starting with the updated docker-compose.yml, the Ollama container now automatically:

1. Starts the Ollama service
2. Waits for it to be ready (up to 60 seconds)
3. Checks if `nomic-embed-text:latest` is present
4. **Pulls the model if missing** (automatic recovery)
5. Begins accepting embedding requests

This eliminates the "model not found" error on first-time deployments.

---

## Rollback to Manual Model Management

If you prefer manual control over model initialization, edit `docker-compose.yml` and remove the `entrypoint` and volume mount under `ollama-local`. Then manually pull the model:

```bash
docker exec ollama-local ollama pull nomic-embed-text:latest
```

---

## Summary of Fixes in This Release

| Issue | Before | After |
|-------|--------|-------|
| Model not loaded on first start | ❌ Manual pull required | ✅ Automatic |
| No diagnostic tool | ❌ Manual troubleshooting | ✅ `./scripts/diagnose-embedding-service.sh` |
| Unclear recovery steps | ❌ Multiple forums | ✅ Structured guide |
| No health checks | ❌ Logs only | ✅ Comprehensive diagnostics |

---

## Need More Help?

1. Run the diagnostic tool: `./scripts/diagnose-embedding-service.sh diagnose`
2. Check the logs: `./scripts/diagnose-embedding-service.sh logs`
3. Review this guide for your specific error
4. If the issue persists, collect all diagnostic output and check the project README for support channels
