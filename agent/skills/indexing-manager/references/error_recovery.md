# Error Recovery Guide

## Overview

This guide provides troubleshooting steps for common errors encountered when using the `indexing-manager` skill.

---

## Configuration Errors

### Error: Config file not found

**Message:**
```
✗ Config file not found: indexing-manager.config.yaml
```

**Cause:** The configuration file is missing from the project root.

**Solution:**
```bash
# Copy the template configuration
cp indexing-manager/assets/config_template.yaml ./indexing-manager.config.yaml

# Edit with your project settings
nano indexing-manager.config.yaml
```

**Verification:**
```bash
ls -la indexing-manager.config.yaml
cat indexing-manager.config.yaml
```

---

### Error: Invalid YAML syntax

**Message:**
```
yaml.scanner.ScannerError: mapping values are not allowed here
```

**Cause:** YAML syntax error in configuration file (common: missing colons, incorrect indentation).

**Solution:**
1. Check indentation (use spaces, not tabs)
2. Ensure all keys have colons: `key: value`
3. Validate YAML syntax:
```bash
python3 -c "import yaml; yaml.safe_load(open('indexing-manager.config.yaml'))"
```

**Example (Correct):**
```yaml
project: example-project
memory_dir: .ai-memory
endpoint: http://127.0.0.1:5000/api/handoff
```

**Example (Incorrect):**
```yaml
project example-project  # Missing colon
memory_dir: .ai-memory
  endpoint: http://127.0.0.1:5000/api/handoff  # Wrong indentation
```

---

## Endpoint Errors

### Error: Endpoint not responding

**Message:**
```
✗ Endpoint not responding: http://127.0.0.1:5000/api/handoff
```

**Cause:** The indexing service is not running or not accessible.

**Solution:**

1. **Check if service is running:**
```bash
curl -v http://127.0.0.1:5000/api/handoff
```

2. **Start the service (if using Docker):**
```bash
docker-compose up -d handoff-service
```

3. **Check port availability:**
```bash
lsof -i :5000
```

4. **Verify network connectivity:**
```bash
ping 127.0.0.1
telnet 127.0.0.1 5000
```

5. **Check firewall rules:**
```bash
sudo ufw status
sudo ufw allow 5000
```

---

### Error: 404 Not Found

**Message:**
```
HTTP 404: <!doctype html>
<title>404 Not Found</title>
```

**Cause:** The endpoint path is incorrect or the service doesn't support that endpoint.

**Solution:**

1. **Verify endpoint URL:**
```bash
# Test common endpoints
curl -v http://127.0.0.1:5000/api/handoff
curl -v http://127.0.0.1:5000/api/index
curl -v http://127.0.0.1:5000/api/upload
```

2. **Check service documentation:**
```bash
curl http://127.0.0.1:5000/  # Get service info
```

3. **Update configuration with correct endpoint:**
```yaml
endpoint: http://127.0.0.1:5000/api/handoff  # Correct endpoint
```

---

### Error: 403 Forbidden

**Message:**
```
HTTP 403: Forbidden
```

**Cause:** Authentication required or access denied.

**Solution:**

1. **Check if API key is required:**
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://endpoint/api/handoff
```

2. **Add API key to configuration:**
```yaml
api_key: ${YOUR_API_KEY}
```

3. **Set environment variable:**
```bash
export YOUR_API_KEY="your-actual-key"
python3 indexing-manager/scripts/batch_indexer.py
```

---

## File Errors

### Error: Memory directory not found

**Message:**
```
✗ Memory directory not found: .ai-memory
```

**Cause:** The configured `memory_dir` doesn't exist.

**Solution:**

1. **Create the directory:**
```bash
mkdir -p .ai-memory
```

2. **Verify configuration:**
```bash
ls -la .ai-memory
```

3. **Update configuration if needed:**
```yaml
memory_dir: ./path/to/your/memory/dir
```

---

### Error: Permission denied

**Message:**
```
PermissionError: [Errno 13] Permission denied: '.ai-memory/file.md'
```

**Cause:** The script doesn't have read permissions on the files.

**Solution:**

1. **Fix file permissions:**
```bash
chmod -R 644 .ai-memory/
```

2. **Fix directory permissions:**
```bash
chmod -R 755 .ai-memory/
```

3. **Verify permissions:**
```bash
ls -la .ai-memory/
```

---

### Error: No files found

**Message:**
```
⚠ No files found to index
```

**Cause:** No files match the configured `file_extensions`.

**Solution:**

1. **Check directory contents:**
```bash
ls -la .ai-memory/
```

2. **Verify file extensions:**
```bash
find .ai-memory -type f | head -20
```

3. **Update configuration to include more extensions:**
```yaml
file_extensions:
  - .md
  - .sh
  - .py
  - .json
  - .yaml
  - .txt  # Add more as needed
```

---

## Upload Errors

### Error: Connection timeout

**Message:**
```
requests.exceptions.Timeout: Connection timeout
```

**Cause:** Network latency or service is slow to respond.

**Solution:**

1. **Increase retry backoff:**
```yaml
retry_backoff_base: 3  # Increase from 2
retry_max: 5  # Increase from 3
```

2. **Reduce concurrency:**
```yaml
concurrency: 1  # Reduce from 3
```

3. **Check network:**
```bash
ping -c 5 127.0.0.1
```

---

### Error: Max retries exceeded

**Message:**
```
Failed: Max retries exceeded
```

**Cause:** File failed to upload after all retry attempts.

**Solution:**

1. **Check service logs:**
```bash
docker logs handoff-service
```

2. **Increase retry attempts:**
```yaml
retry_max: 5  # Increase from 3
```

3. **Manually retry failed file:**
```bash
python3 indexing-manager/scripts/batch_indexer.py --retry-failed
```

---

### Error: Partial failures

**Message:**
```
Failed: 5
Success Rate: 93.9%
```

**Cause:** Some files uploaded successfully, others failed.

**Solution:**

1. **Review failed files in logs:**
```bash
tail -50 indexing-manager.log
```

2. **Retry with increased backoff:**
```yaml
retry_backoff_base: 3
retry_max: 5
```

3. **Reduce concurrency to avoid overwhelming service:**
```yaml
concurrency: 1
```

---

## Performance Issues

### Issue: Slow uploads

**Symptoms:** Uploads taking >5 seconds per file

**Solution:**

1. **Increase concurrency:**
```yaml
concurrency: 5  # Increase from 3
```

2. **Check network bandwidth:**
```bash
iperf3 -c 127.0.0.1  # Test network speed
```

3. **Monitor service resources:**
```bash
docker stats handoff-service
```

---

### Issue: High memory usage

**Symptoms:** Process consuming >500MB RAM

**Solution:**

1. **Reduce concurrency:**
```yaml
concurrency: 1  # Reduce from 3
```

2. **Process files in batches:**
```bash
# Split .ai-memory into smaller directories
mkdir .ai-memory-batch-1
mv .ai-memory/*.md .ai-memory-batch-1/
# Run indexer on each batch
```

---

## Debugging

### Enable verbose logging

```bash
# Set debug environment variable
export DEBUG=1
python3 indexing-manager/scripts/batch_indexer.py
```

### Check configuration

```bash
python3 -c "
import yaml
with open('indexing-manager.config.yaml') as f:
    config = yaml.safe_load(f)
    for key, value in config.items():
        print(f'{key}: {value}')
"
```

### Test endpoint manually

```bash
# Test with curl
curl -X POST http://127.0.0.1:5000/api/handoff \
  -F "project=test" \
  -F "file=@test.md"
```

---

## Getting Help

If you encounter an error not listed here:

1. **Check the logs:**
```bash
tail -100 indexing-manager.log
```

2. **Review the main documentation:**
- [`INDEXING-MANAGER-SKILL.md`](INDEXING-MANAGER-SKILL.md)
- [`indexing_patterns.md`](indexing-manager-indexing-patterns.md)

3. **Consult the API specifications:**
- [`api_specifications.md`](indexing-manager-api-specifications.md)

4. **Report the issue with:**
- Error message (full output)
- Configuration file (sanitized)
- Service logs
- Steps to reproduce
