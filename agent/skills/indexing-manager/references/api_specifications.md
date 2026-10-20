# API Specifications Reference

## Overview

This document provides technical specifications for multipart form-data uploads, timeout handling, rate limiting, and connection pooling used by the `indexing-manager` skill.

---

## HTTP Multipart Form-Data

### Structure

Multipart form-data is used to upload files with metadata in a single HTTP request.

**Format:**
```
POST /api/handoff HTTP/1.1
Host: 127.0.0.1:5000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="document.md"
Content-Type: text/markdown

[Binary file content here]
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="project"

example-project
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="timestamp"

2026-04-17T16:00:00Z
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | Yes | Document content (any file type) |
| `project` | string | Yes | Project identifier for metadata |
| `timestamp` | ISO 8601 | No | Upload timestamp (auto-generated if omitted) |
| `collection_name` | string | No | Qdrant collection name (default: agent-memory) |
| `tags` | JSON array | No | Document tags for categorization |

### Example (Python requests library)

```python
import requests
from pathlib import Path

file_path = Path('.ai-memory/document.md')

with open(file_path, 'rb') as f:
    files = {
        'file': (file_path.name, f, 'text/markdown'),
    }
    data = {
        'project': 'example-project',
        'timestamp': '2026-04-17T16:00:00Z',
    }
    response = requests.post(
        'http://127.0.0.1:5000/api/handoff',
        files=files,
        data=data,
        timeout=30
    )
    print(response.json())
```

### Example (curl)

```bash
curl -X POST http://127.0.0.1:5000/api/handoff \
  -F "file=@document.md" \
  -F "project=example-project" \
  -F "timestamp=2026-04-17T16:00:00Z"
```

---

## File Encoding and MIME Types

### Supported MIME Types

| Extension | MIME Type | Encoding |
|-----------|-----------|----------|
| `.md` | `text/markdown` | UTF-8 |
| `.txt` | `text/plain` | UTF-8 |
| `.json` | `application/json` | UTF-8 |
| `.yaml` | `application/x-yaml` | UTF-8 |
| `.yml` | `application/x-yaml` | UTF-8 |
| `.sh` | `text/x-shellscript` | UTF-8 |
| `.py` | `text/x-python` | UTF-8 |
| `.pdf` | `application/pdf` | Binary |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Binary |

### Auto-Detection

The `batch_indexer.py` script automatically detects MIME types based on file extensions:

```python
MIME_TYPES = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.yaml': 'application/x-yaml',
    '.yml': 'application/x-yaml',
    '.sh': 'text/x-shellscript',
    '.py': 'text/x-python',
}

mime_type = MIME_TYPES.get(file_path.suffix, 'application/octet-stream')
```

---

## Timeout Handling

### Connection Timeout

**Definition:** Time to establish initial connection to server

**Default:** 5 seconds

**Configuration:**
```python
response = requests.post(
    endpoint,
    files=files,
    data=data,
    timeout=(5, 30)  # (connect_timeout, read_timeout)
)
```

### Read Timeout

**Definition:** Time to receive response after request is sent

**Default:** 30 seconds

**Configuration:**
```yaml
# In indexing-manager.config.yaml
timeout_connect: 5
timeout_read: 30
```

### Timeout Handling Strategy

```python
import requests
from requests.exceptions import Timeout, ConnectionError

max_retries = 3
backoff_base = 2

for attempt in range(max_retries):
    try:
        response = requests.post(
            endpoint,
            files=files,
            data=data,
            timeout=(5, 30)
        )
        if response.status_code in [200, 201, 202]:
            return True
    except (Timeout, ConnectionError) as e:
        if attempt < max_retries - 1:
            wait_time = backoff_base ** attempt
            time.sleep(wait_time)
        else:
            raise
```

---

## Connection Pooling

### HTTP Keep-Alive

**Purpose:** Reuse TCP connections across multiple requests

**Benefits:**
- Reduced latency (no new connection overhead)
- Lower CPU usage
- Better throughput

**Implementation:**
```python
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

session = requests.Session()

# Configure retry strategy
retry_strategy = Retry(
    total=3,
    backoff_factor=2,
    status_forcelist=[429, 500, 502, 503, 504],
)

adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=10)
session.mount("http://", adapter)
session.mount("https://", adapter)

# Use session for requests
response = session.post(endpoint, files=files, data=data)
```

### Connection Pool Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `pool_connections` | 10 | Number of connection pools to cache |
| `pool_maxsize` | 10 | Maximum connections per pool |
| `pool_block` | False | Block when pool is exhausted |

---

## Rate Limiting

### Server-Side Rate Limits

**Common patterns:**
- Requests per second: 10-100 req/s
- Requests per minute: 600-6000 req/min
- Concurrent connections: 5-50

### Client-Side Rate Limiting

**Implementation:**
```python
import time
from concurrent.futures import ThreadPoolExecutor

class RateLimiter:
    def __init__(self, requests_per_second=10):
        self.min_interval = 1.0 / requests_per_second
        self.last_request_time = 0
    
    def wait(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_request_time = time.time()

# Usage
limiter = RateLimiter(requests_per_second=10)

def upload_with_rate_limit(file_path):
    limiter.wait()
    return upload_file(file_path)
```

### Backoff Strategy

**Exponential Backoff:**
```
Attempt 1: Immediate
Attempt 2: Wait 2^1 = 2 seconds
Attempt 3: Wait 2^2 = 4 seconds
Attempt 4: Wait 2^3 = 8 seconds
```

**Configuration:**
```yaml
retry_max: 3
retry_backoff_base: 2
```

**Implementation:**
```python
for attempt in range(retry_max):
    try:
        response = requests.post(endpoint, files=files, data=data)
        if response.status_code in [200, 201, 202]:
            return True
    except Exception as e:
        if attempt < retry_max - 1:
            wait_time = retry_backoff_base ** attempt
            time.sleep(wait_time)
        else:
            raise
```

---

## Metadata Attachment

### Standard Metadata Fields

```python
metadata = {
    'project': 'qdrant-memory-mcp',        # Project identifier
    'timestamp': '2026-04-17T16:00:00Z',   # ISO 8601 upload time
    'filename': 'document.md',              # Original filename
    'file_size': 1024,                      # File size in bytes
    'file_hash': 'sha256:abc123...',        # File hash for integrity
    'collection_name': 'agent-memory',     # Qdrant collection name
    'tags': ['incident', 'redis', 'prod'], # Document tags
}
```

### Attaching Metadata

```python
import hashlib
from pathlib import Path

def compute_file_hash(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return f"sha256:{sha256_hash.hexdigest()}"

file_path = Path('.ai-memory/document.md')
file_size = file_path.stat().st_size
file_hash = compute_file_hash(file_path)

data = {
    'project': 'example-project',
    'timestamp': datetime.utcnow().isoformat(),
    'filename': file_path.name,
    'file_size': file_size,
    'file_hash': file_hash,
}

response = requests.post(endpoint, files=files, data=data)
```

---

## Response Handling

### Success Response (200-202)

```json
{
  "status": "success",
  "message": "Document indexed",
  "document_id": "doc-12345",
  "workspace": "example-project",
  "indexed_at": "2026-04-17T16:00:00Z"
}
```

### Error Response (4xx-5xx)

```json
{
  "status": "error",
  "error_code": "INVALID_FILE",
  "message": "File type not supported",
  "details": {
    "filename": "document.exe",
    "mime_type": "application/x-msdownload"
  }
}
```

### Handling Responses

```python
def handle_response(response):
    if response.status_code in [200, 201, 202]:
        data = response.json()
        print(f"Success: {data.get('message')}")
        return True
    elif response.status_code == 400:
        error = response.json()
        print(f"Bad Request: {error.get('message')}")
        return False
    elif response.status_code == 429:
        print("Rate limited, retrying...")
        return None  # Retry
    elif response.status_code >= 500:
        print("Server error, retrying...")
        return None  # Retry
    else:
        print(f"Unexpected status: {response.status_code}")
        return False
```

---

## Performance Optimization

### Batch Upload Strategy

**Sequential (Slow):**
```
File 1: 2s
File 2: 2s
File 3: 2s
Total: 6s
```

**Concurrent (Fast):**
```
File 1: 2s ─┐
File 2: 2s ─┼─ Total: 2s (3 workers)
File 3: 2s ─┘
```

### Concurrency Configuration

```yaml
# Conservative (stable, slower)
concurrency: 1
retry_max: 5
retry_backoff_base: 2

# Balanced (recommended)
concurrency: 3
retry_max: 3
retry_backoff_base: 2

# Aggressive (fast, may fail more)
concurrency: 10
retry_max: 1
retry_backoff_base: 1
```

### Throughput Benchmarks

| Concurrency | File Size | Throughput | Latency |
|-------------|-----------|-----------|---------|
| 1 | 50KB | 30 files/min | 2s/file |
| 3 | 50KB | 90 files/min | 0.7s/file |
| 5 | 50KB | 150 files/min | 0.4s/file |
| 10 | 50KB | 200 files/min | 0.3s/file |

---

## Security Considerations

### HTTPS/TLS

**Enable for production:**
```yaml
endpoint: https://api.example.com/v1/documents
```

**Certificate Verification:**
```python
response = requests.post(
    endpoint,
    files=files,
    data=data,
    verify=True  # Verify SSL certificate
)
```

### Authentication

**API Key:**
```python
headers = {
    'Authorization': f'Bearer {api_key}'
}
response = requests.post(endpoint, files=files, data=data, headers=headers)
```

**Basic Auth:**
```python
response = requests.post(
    endpoint,
    files=files,
    data=data,
    auth=(username, password)
)
```

---

## Related Documentation

- [`INDEXING-MANAGER-SKILL.md`](INDEXING-MANAGER-SKILL.md) — Main skill documentation
- [`indexing_patterns.md`](indexing-manager-indexing-patterns.md) — Endpoint catalog
- [`error_recovery.md`](indexing-manager-error-recovery.md) — Troubleshooting guide
