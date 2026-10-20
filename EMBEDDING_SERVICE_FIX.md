# Embedding Service Quick Reference

## Status Check
```bash
./scripts/diagnose-embedding-service.sh diagnose
```

## Common Commands

| Problem | Command |
|---------|---------|
| Model not loading | `./scripts/diagnose-embedding-service.sh pull-model` |
| Service not responding | `./scripts/diagnose-embedding-service.sh restart` |
| Test embeddings | `./scripts/diagnose-embedding-service.sh test` |
| View logs | `./scripts/diagnose-embedding-service.sh logs` |

## What Was Fixed

### ✅ Root Cause: Missing Embedding Model
The `nomic-embed-text:latest` model was never pulled into the Ollama container, causing all embedding requests to fail with **404 Not Found**.

**Error Pattern:**
```
POST /api/embeddings → 404
Error: "model \"nomic-embed-text:latest\" not found, try pulling it first"
```

### ✅ Solution 1: Automatic Model Initialization (Recommended)
Updated `docker-compose.yml` to include a custom entrypoint script that:
1. Starts Ollama
2. Waits for the service to be ready
3. Checks if the model exists
4. **Automatically pulls it if missing**

**Changes:**
- [`docker-compose.yml`](docker-compose.yml) — Added entrypoint and volume mount
- [`mcp-server/docker-entrypoint-ollama.sh`](mcp-server/docker-entrypoint-ollama.sh) — New initialization script

### ✅ Solution 2: Comprehensive Diagnostic Tool
Created [`scripts/diagnose-embedding-service.sh`](scripts/diagnose-embedding-service.sh) with:
- **Phase 1:** Container health checks
- **Phase 2:** Service connectivity verification
- **Phase 3:** Model availability checks
- **Phase 4:** Embedding generation testing
- **Phase 5:** System integration (Qdrant, MCP)
- **Phase 6:** Log inspection

### ✅ Solution 3: Troubleshooting Documentation
Created [`EMBEDDING_SERVICE_TROUBLESHOOTING.md`](EMBEDDING_SERVICE_TROUBLESHOOTING.md) covering:
- Common issues and solutions
- Performance tuning
- Monitoring & metrics
- Logs and debugging

## How to Deploy These Fixes

### For Development (Local Testing)

**Option A: Use updated docker-compose (automatic)**
```bash
docker-compose down
docker-compose up -d  # Model will auto-pull on startup
./scripts/diagnose-embedding-service.sh diagnose
```

**Option B: Manual model pull (if needed)**
```bash
docker exec ollama-local ollama pull nomic-embed-text:latest
./scripts/diagnose-embedding-service.sh test
```

### For Production Deployment

1. Update your deployment to include the new entrypoint script
2. The automatic model initialization will prevent "model not found" errors in production
3. Use the diagnostic tool in your health checks:
   ```bash
   ./scripts/diagnose-embedding-service.sh diagnose || exit 1
   ```

## Testing

All diagnostics now pass:
```
✅ Phase 1: Container Health — PASS
✅ Phase 2: Service Connectivity — PASS
✅ Phase 3: Model Availability — PASS (274 MB, auto-pulled)
✅ Phase 4: Embedding Generation — PASS (768-dimensional vectors)
✅ Phase 5: System Integration — PASS (Qdrant + MCP)
```

## Files Changed/Created

| File | Type | Purpose |
|------|------|---------|
| `docker-compose.yml` | Modified | Added entrypoint and volume mount for Ollama initialization |
| `mcp-server/docker-entrypoint-ollama.sh` | New | Automatic model initialization script (executable) |
| `scripts/diagnose-embedding-service.sh` | New | Comprehensive diagnostic and recovery tool (executable) |
| `EMBEDDING_SERVICE_TROUBLESHOOTING.md` | New | Complete troubleshooting guide |

## Next Steps

1. **Deploy:** Use the updated docker-compose.yml in your deployment pipeline
2. **Monitor:** Run periodic diagnostics: `./scripts/diagnose-embedding-service.sh diagnose`
3. **Document:** Share the troubleshooting guide with your team
4. **Test:** Verify in staging before production rollout

## Verify the Fix

Run a quick end-to-end test:
```bash
# Pull the latest code
git pull

# Bring down and restart services with new config
docker-compose down
docker-compose up -d

# Wait 30-60 seconds for Ollama to initialize
sleep 45

# Run diagnostics
./scripts/diagnose-embedding-service.sh diagnose

# Test embedding generation (should pass)
curl -s -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text:latest","prompt":"test"}' | jq '.embedding | length'
# Should output: 768
```

---

**Last Updated:** 2026-09-15
**Status:** ✅ All diagnostics passing
