---
name: indexing-manager
description: >
  This skill should be used when pushing, syncing, or indexing files from
  .ai-memory/ directories to external indexing services such as the Qdrant MCP server,
  local handoff service, or vector stores. Use when a user says "push to indexer", "sync ai-memory",
  "index session files", "trigger handoff", or "push documentation to external brain".
  Handles endpoint discovery, batch upload with concurrency, retry logic with
  exponential backoff, and comprehensive progress reporting.
---

# Indexing Manager Skill

## Purpose

Manage batch document indexing to external services (handoff endpoints, vector stores, search engines) with automatic endpoint discovery, concurrent uploads, retry logic, and error recovery.

## When to Use This Skill

Invoke this skill when:

- Pushing `.ai-memory/` session documentation to indexing endpoints
- Syncing project documentation to external knowledge bases
- Batch uploading files to vector stores or search services
- Migrating content between indexing systems
- Troubleshooting failed indexing operations

## How to Use This Skill

### Step 1: Verify Configuration

Before running any indexing operation, ensure a `indexing-manager.config.yaml` file exists in the project root. If not, copy the template from `assets/config_template.yaml` and customize for the project:

```bash
cp indexing-manager/assets/config_template.yaml ./indexing-manager.config.yaml
# Edit indexing-manager.config.yaml with project-specific values
```

### Step 2: Run the Batch Indexer

Execute the primary indexing script:

```bash
python3 indexing-manager/scripts/batch_indexer.py
```

The script will:

1. **Load configuration** from `indexing-manager.config.yaml`
2. **Validate the endpoint** using `endpoint_validator.py` (probe-and-discover pattern)
3. **Discover files** recursively from `memory_dir` matching `file_extensions`
4. **Upload concurrently** using `ThreadPoolExecutor` (default: 3 workers)
5. **Retry failed uploads** using exponential backoff via `retry_handler.py`
6. **Report progress** in real-time with success/failure counts
7. **Generate summary** with total files, successes, failures, and execution time

### Step 3: Handle Errors

If uploads fail, consult `indexing-manager/references/error_recovery.md` for troubleshooting steps. Common issues:

- **Endpoint not found:** The validator probes known endpoints. If all fail, check that the indexing service is running.
- **File permission denied:** Ensure the script has read access to all files in `memory_dir`.
- **Timeout errors:** Increase `retry_max` or `retry_backoff_base` in the config file.
- **Partial failures:** The script logs failed files. Retry with `retry_handler.py` or manually re-upload.

## Bundled Resources

### Scripts

#### `scripts/batch_indexer.py`

Main execution engine. Orchestrates file discovery, concurrent uploads, and progress reporting.

**Usage:**
```bash
python3 indexing-manager/scripts/batch_indexer.py
```

**Configuration:** Reads from `indexing-manager.config.yaml` in the project root.

**Output:** Real-time progress + summary report.

#### `scripts/endpoint_validator.py`

Pre-flight endpoint discovery. Probes known endpoints and returns the first responding one.

**Known endpoints:**
- `/mcp` (Qdrant MCP server - recommended)
- `/api/handoff` (legacy local handoff service)
- `/api/index` (alternative indexing endpoint)
- `/api/upload` (generic upload endpoint)
- `/api/documents` (document management endpoint)

**Usage:** Called automatically by `batch_indexer.py`. Can also be invoked standalone:

```bash
python3 indexing-manager/scripts/endpoint_validator.py --base-url http://127.0.0.1:5000
```

#### `scripts/retry_handler.py`

Exponential backoff retry logic. Implements configurable retry attempts with increasing delays.

**Formula:** `wait_time = retry_backoff_base ^ attempt_number`

**Example:** With `retry_backoff_base=2` and `retry_max=3`:
- Attempt 1: Immediate
- Attempt 2: Wait 2 seconds
- Attempt 3: Wait 4 seconds
- Attempt 4: Wait 8 seconds (then fail)

**Usage:** Called automatically by `batch_indexer.py` for failed uploads.

### References

#### `references/indexing_patterns.md`

Catalog of common indexing endpoint patterns and their specifications:

- **Qdrant MCP Server** (`http://localhost:3000/mcp`) — Native Qdrant integration via Model Context Protocol
- **Handoff Service** (`http://127.0.0.1:5000/api/handoff`) — Legacy local Docker service
- **Elasticsearch** — Bulk indexing API patterns
- **Milvus** — Vector database upload patterns
- **Pinecone** — Cloud vector store patterns

#### `references/error_recovery.md`

Comprehensive troubleshooting runbook covering:

- Endpoint discovery failures
- File permission errors
- Timeout and connection errors
- Partial upload failures
- Configuration validation errors
- Retry exhaustion scenarios

#### `references/api_specifications.md`

Technical reference for multipart form-data uploads:

- HTTP multipart form-data structure
- File encoding and MIME types
- Metadata attachment patterns
- Timeout handling and connection pooling
- Rate limiting and backoff strategies

### Assets

#### `assets/config_template.yaml`

Project-scoped configuration template. Copy to project root and customize:

```yaml
# indexing-manager.config.yaml
project: example-project
memory_dir: .ai-memory
endpoint: http://127.0.0.1:5000/api/handoff
workspace_slug: example-project
file_extensions:
  - .md
  - .sh
  - .py
  - .json
  - .yaml
concurrency: 3
retry_max: 3
retry_backoff_base: 2
```

**Configuration Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `project` | string | — | Project name (used for metadata) |
| `memory_dir` | string | `.ai-memory` | Directory containing files to index |
| `endpoint` | string | — | Full URL of indexing endpoint |
| `collection_name` | string | `agent-memory` | Qdrant collection name |
| `file_extensions` | list | `[.md, .sh, .py, .json, .yaml]` | File types to include |
| `concurrency` | int | `3` | Number of concurrent upload workers |
| `retry_max` | int | `3` | Maximum retry attempts per file |
| `retry_backoff_base` | int | `2` | Base for exponential backoff calculation |

## Workflow Example

### Scenario: Push .ai-memory/ to Local Handoff Service

```bash
# 1. Verify config exists
ls indexing-manager.config.yaml

# 2. Run indexer
python3 indexing-manager/scripts/batch_indexer.py

# Output:
# ╔════════════════════════════════════════════════════════════════╗
# ║  Indexing Manager - Batch Upload                              ║
# ╚════════════════════════════════════════════════════════════════╝
#
# 📁 Source Directory: .ai-memory
# 🌐 Endpoint: http://127.0.0.1:5000/api/handoff
# 🧠 Project: example-project
#
# ✓ Endpoint validated: /api/handoff responding
# ✓ Found 82 files
#
# Uploading (3 concurrent workers):
#   [1/82] INCIDENT_DOCUMENTATION_INDEX.md ✓
#   [2/82] INCIDENT_EXECUTIVE_SUMMARY.md ✓
#   [3/82] INCIDENT_RCA_INVESTIGATION_PLAN.md ✓
#   ...
#   [82/82] waf-extraction-script.sh ✓
#
# ╔════════════════════════════════════════════════════════════════╗
# ║  Summary                                                       ║
# ╚════════════════════════════════════════════════════════════════╝
#
# Total Files: 82
# Successful: 82
# Failed: 0
# Execution Time: 2m 14s
# Success Rate: 100%
```

## Migration from Legacy Scripts

This skill consolidates overlapping legacy scripts:

- `sync-roo-memory-handoff.sh` → **DEPRECATED**
- `push_ai_memory_to_indexer.py` → **DEPRECATED**

**Migration Steps:**

1. Copy `indexing-manager/assets/config_template.yaml` to project root as `indexing-manager.config.yaml`
2. Customize configuration for your project
3. Run `python3 indexing-manager/scripts/batch_indexer.py`
4. Delete legacy scripts after verifying successful indexing
5. Update CI/CD pipelines to use the new skill

## Troubleshooting

### Endpoint Not Found

**Error:** `EndpointNotFoundError: No responding endpoint found`

**Solution:** Verify the indexing service is running:

```bash
curl -v http://127.0.0.1:5000/api/handoff
```

If the service is not running, start it:

```bash
docker-compose up -d handoff-service
```

### File Permission Denied

**Error:** `PermissionError: [Errno 13] Permission denied: '.ai-memory/file.md'`

**Solution:** Ensure the script has read access:

```bash
chmod -R 644 .ai-memory/
```

### Timeout Errors

**Error:** `requests.exceptions.Timeout: Connection timeout`

**Solution:** Increase retry backoff or reduce concurrency in `indexing-manager.config.yaml`:

```yaml
concurrency: 1  # Reduce from 3 to 1
retry_backoff_base: 3  # Increase from 2 to 3
```

### Partial Failures

**Error:** Some files uploaded, others failed

**Solution:** Check `indexing-manager/references/error_recovery.md` for specific error codes. Retry failed files:

```bash
python3 indexing-manager/scripts/retry_handler.py --failed-files failed_list.txt
```

## Performance Characteristics

| Metric | Sequential | Concurrent (3 workers) | Improvement |
|--------|-----------|----------------------|-------------|
| 82 files | ~7 minutes | ~2-3 minutes | 65-70% faster |
| Avg file size | 50KB | 50KB | — |
| Network utilization | 1 connection | 3 connections | 3x parallelism |
| CPU usage | Low | Low | Minimal overhead |

## Related Documentation

- [`ADR-010-INDEXING-MANAGER-SKILL.md`](.ai-memory/ADR-010-INDEXING-MANAGER-SKILL.md) — Architectural decision record
- [`indexing-manager/references/indexing_patterns.md`](indexing-manager/references/indexing_patterns.md) — Endpoint catalog
- [`indexing-manager/references/error_recovery.md`](indexing-manager/references/error_recovery.md) — Troubleshooting guide
- [`indexing-manager/references/api_specifications.md`](indexing-manager/references/api_specifications.md) — Technical reference
