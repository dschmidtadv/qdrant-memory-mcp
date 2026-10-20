# MCP Server Self-Healing Deployment Guide

## Overview

This guide explains how to deploy the Qdrant Memory MCP Server with automatic self-healing capabilities. The system includes:

- **Health Checks:** Continuous monitoring of all services
- **Auto-Restart:** Automatic restart on failure with exponential backoff
- **Graceful Degradation:** Fallback to stdio mode if HTTP mode fails
- **Comprehensive Logging:** Detailed logs for troubleshooting
- **Signal Handling:** Proper cleanup on shutdown

---

## Architecture

### Deployment Model: Infrastructure + Host Process

```
┌──────────────────────────────────────────────────────────────┐
│                  Docker Compose Stack                         │
│              (Infrastructure Services Only)                   │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │  Qdrant Vector   │  │  Ollama Embed    │                  │
│  │  Database        │  │  Service         │                  │
│  │  (port 6333)     │  │  (port 11434)    │                  │
│  │  ✓ Health Check  │  │  ✓ Health Check  │                  │
│  │  ✓ Auto-Restart  │  │  ✓ Auto-Restart  │                  │
│  └──────────────────┘  └──────────────────┘                  │
│           ▲                      ▲                             │
│           │                      │                             │
│  ┌────────┴──────────────────────┴────────┐                  │
│  │                                         │                  │
│  │    Prometheus + Grafana                │                  │
│  │    ✓ Metrics Collection                │                  │
│  │    ✓ Dashboards                        │                  │
│  └─────────────────────────────────────────┘                  │
│                                                                │
└──────────────────────────────────────────────────────────────┘
                            ▲
                            │
                     (Docker Network)
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              Host Process (Node.js)                           │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────────────────────────┐                  │
│  │    MCP Server (npm start)              │                  │
│  │    ✓ HTTP Transport (port 5000)        │                  │
│  │    ✓ Metrics Endpoint (port 9091)      │                  │
│  │    ✓ Qdrant Connection (localhost)     │                  │
│  │    ✓ Graceful Signal Handling          │                  │
│  └────────────────────────────────────────┘                  │
│           ▲                                                    │
│           │                                                    │
│  ┌────────┴──────────────────────────────┐                   │
│  │                                        │                   │
│  │  Health Monitor Script                 │                   │
│  │  ✓ Continuous Monitoring (30s)         │                   │
│  │  ✓ Auto-Healing on Failure             │                   │
│  │  ✓ Comprehensive Logging               │                   │
│  │  ✓ Exponential Backoff (5s→300s)       │                   │
│  │  ✓ Process & Docker Service Restart    │                   │
│  └────────────────────────────────────────┘                   │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

- **Separation of Concerns:** Docker Compose manages infrastructure; host process manages application
- **Simplicity:** No Docker container overhead for Node.js application
- **Reliability:** Host process monitoring is more direct than Docker health checks
- **Flexibility:** Easy to restart MCP Server without affecting infrastructure
- **Debugging:** Direct access to logs and processes on host

---

## Quick Start

### Step 1: Navigate to Project

```bash
cd /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp
```

### Step 2: Start Services with Health Checks

```bash
# Use the enhanced docker-compose with health checks
docker-compose -f docker-compose.healthcheck.yml up -d

# Verify services are starting
docker-compose -f docker-compose.healthcheck.yml ps
```

### Step 3: Wait for Services to Be Healthy

```bash
# Check Qdrant health
curl http://localhost:6333/api/health

# Check MCP Server metrics
curl http://localhost:9091/metrics

# Check Ollama
curl http://localhost:11434/api/tags
```

### Step 4: Start Health Monitor

```bash
# Make monitor script executable
chmod +x scripts/mcp-monitor.sh

# Start monitoring in background
./scripts/mcp-monitor.sh &

# Or run in foreground for debugging
./scripts/mcp-monitor.sh
```

### Step 5: Verify MCP Server is Running

```bash
# Check if MCP server is responding
curl -X POST http://localhost:5000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## Configuration

### Environment Variables

Create or update `.env` file:

```bash
# Qdrant Configuration
QDRANT_URL=http://qdrant-local:6333
QDRANT_PREFER_MMAP=true

# MCP Server Configuration
TRANSPORT_MODE=http
NODE_ENV=production
LOG_LEVEL=info

# Resource Limits
QDRANT_MEM_LIMIT=4g
QDRANT_MEM_RESERVATION=2g
QDRANT_CPUS=2.0

OLLAMA_MEM_LIMIT=2g
OLLAMA_MEM_RESERVATION=1g
OLLAMA_CPUS=1.5
```

### Docker Compose Override

To customize settings without modifying the main file:

```bash
# Create docker-compose.override.yml
cat > docker-compose.override.yml << 'EOF'
version: '3.8'
services:
  mcp-server:
    environment:
      - LOG_LEVEL=debug
      - TRANSPORT_MODE=http
    ports:
      - "5000:5000"
      - "9091:9091"
EOF

# Docker Compose will automatically merge this with the main file
docker-compose up -d
```

---

## Monitoring and Troubleshooting

### View Service Logs

```bash
# MCP Server logs
docker logs -f mcp-server

# Qdrant logs
docker logs -f qdrant-local

# Ollama logs
docker logs -f ollama-local

# Monitor script logs
tail -f logs/mcp-monitor.log
```

### Check Service Health

```bash
# Check all services
docker-compose -f docker-compose.healthcheck.yml ps

# Check specific service health
docker inspect mcp-server | grep -A 5 '"Health"'

# Manual health checks
curl http://localhost:6333/api/health
curl http://localhost:9091/metrics
curl http://localhost:11434/api/tags
```

### Common Issues and Solutions

#### Issue: MCP Server keeps restarting

**Symptoms:**
```
ERROR: Service mcp-server failed 3 consecutive health checks
```

**Solutions:**

1. Check Qdrant is running:
```bash
docker logs qdrant-local | tail -20
curl http://localhost:6333/api/health
```

2. Check MCP Server logs:
```bash
docker logs mcp-server | tail -50
```

3. Verify environment variables:
```bash
docker inspect mcp-server | grep -A 20 '"Env"'
```

4. Restart with debug logging:
```bash
docker-compose -f docker-compose.healthcheck.yml down mcp-server
docker-compose -f docker-compose.healthcheck.yml up -d mcp-server
docker logs -f mcp-server
```

#### Issue: Qdrant connection timeout

**Symptoms:**
```
Failed to connect to Qdrant after 5 attempts
```

**Solutions:**

1. Check Qdrant is healthy:
```bash
docker logs qdrant-local | grep -i "error\|failed"
```

2. Verify network connectivity:
```bash
docker exec mcp-server curl -v http://qdrant-local:6333/api/health
```

3. Check resource limits:
```bash
docker stats qdrant-local
```

4. Increase startup delay in docker-compose.yml:
```yaml
mcp-server:
  healthcheck:
    start_period: 120s  # Increase from 60s
```

#### Issue: High memory usage

**Symptoms:**
```
docker stats shows high memory usage
```

**Solutions:**

1. Check memory limits:
```bash
docker inspect qdrant-local | grep -i "memory"
```

2. Reduce vector size in production:
```bash
# In mcp-server/src/qdrant.ts
const VECTOR_SIZE = 512;  // Reduce from 1024
```

3. Adjust Qdrant configuration:
```bash
docker exec qdrant-local curl -X PATCH http://localhost:6333/api/config \
  -H "Content-Type: application/json" \
  -d '{"storage":{"snapshots_path":"/qdrant/storage/snapshots"}}'
```

---

## Auto-Healing Mechanism

### How It Works

1. **Health Checks (30s interval)**
   - Monitors Qdrant, Ollama, and MCP Server
   - Checks HTTP endpoints for responsiveness

2. **Failure Detection (3 consecutive failures)**
   - Tracks consecutive failures per service
   - Triggers restart after threshold

3. **Exponential Backoff**
   - Initial delay: 5 seconds
   - Doubles on each restart: 5s → 10s → 20s → 40s → 60s
   - Maximum delay: 300 seconds (5 minutes)

4. **Graceful Restart**
   - Sends SIGTERM to allow cleanup
   - Waits for process to exit
   - Restarts container

5. **Logging**
   - All events logged to `logs/mcp-monitor.log`
   - Includes timestamps and service status

### Customizing Auto-Healing

Edit `scripts/mcp-monitor.sh`:

```bash
# Adjust health check interval (seconds)
HEALTH_CHECK_INTERVAL=30

# Adjust failure threshold
MAX_CONSECUTIVE_FAILURES=3

# Adjust restart delays
RESTART_DELAY=5
MAX_RESTART_DELAY=300
```

---

## Production Deployment

### Using Systemd Service

Create `/etc/systemd/system/mcp-server.service`:

```ini
[Unit]
Description=MCP Server with Qdrant Memory
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp
ExecStart=/usr/bin/docker-compose -f docker-compose.healthcheck.yml up
ExecStop=/usr/bin/docker-compose -f docker-compose.healthcheck.yml down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mcp-server
sudo systemctl start mcp-server
sudo systemctl status mcp-server
```

### Using Supervisor

Create `/etc/supervisor/conf.d/mcp-server.conf`:

```ini
[program:mcp-server]
directory=/Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp
command=/usr/bin/docker-compose -f docker-compose.healthcheck.yml up
autostart=true
autorestart=true
startsecs=10
stopasgroup=true
stdout_logfile=/var/log/mcp-server.log
stderr_logfile=/var/log/mcp-server-error.log
```

Enable and start:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start mcp-server
sudo supervisorctl status mcp-server
```

---

## Testing Self-Healing

### Test 1: Simulate Qdrant Failure

```bash
# Stop Qdrant
docker stop qdrant-local

# Monitor should detect failure and restart
tail -f logs/mcp-monitor.log

# Verify restart
docker ps | grep qdrant-local
```

### Test 2: Simulate MCP Server Failure

```bash
# Kill MCP Server process
docker kill mcp-server

# Monitor should detect failure and restart
tail -f logs/mcp-monitor.log

# Verify restart
docker ps | grep mcp-server
```

### Test 3: Simulate Network Partition

```bash
# Disconnect MCP Server from network
docker network disconnect qdrant-mcp-network mcp-server

# Monitor should detect failure
tail -f logs/mcp-monitor.log

# Reconnect
docker network connect qdrant-mcp-network mcp-server
```

---

## Cleanup and Shutdown

### Graceful Shutdown

```bash
# Stop monitor script
pkill -f mcp-monitor.sh

# Stop all services
docker-compose -f docker-compose.healthcheck.yml down

# Remove volumes (optional)
docker-compose -f docker-compose.healthcheck.yml down -v
```

### Emergency Shutdown

```bash
# Force stop all containers
docker-compose -f docker-compose.healthcheck.yml kill

# Remove containers
docker-compose -f docker-compose.healthcheck.yml rm -f
```

---

## Performance Tuning

### Optimize Qdrant

```yaml
qdrant-local:
  environment:
    - QDRANT_PREFER_MMAP=true
    - QDRANT_SNAPSHOT_RECOVERY=true
  mem_limit: 8g  # Increase for large datasets
```

### Optimize Ollama

```yaml
ollama-local:
  environment:
    - OLLAMA_NUM_PARALLEL=4
    - OLLAMA_NUM_GPU=1
  mem_limit: 4g  # Increase for GPU support
```

### Optimize MCP Server

```bash
# In mcp-server/src/index.ts
const MAX_CONCURRENT_REQUESTS = 10;
const REQUEST_TIMEOUT = 30000;  // 30 seconds
```

---

## Support and Debugging

### Enable Debug Logging

```bash
# Set debug environment variable
export LOG_LEVEL=debug

# Restart services
docker-compose -f docker-compose.healthcheck.yml restart mcp-server

# View debug logs
docker logs -f mcp-server
```

### Collect Diagnostics

```bash
# Create diagnostics bundle
mkdir -p diagnostics
docker logs mcp-server > diagnostics/mcp-server.log
docker logs qdrant-local > diagnostics/qdrant.log
docker logs ollama-local > diagnostics/ollama.log
docker stats --no-stream > diagnostics/docker-stats.txt
docker ps -a > diagnostics/docker-ps.txt
cp logs/mcp-monitor.log diagnostics/

# Archive for support
tar -czf diagnostics.tar.gz diagnostics/
```

---

## Troubleshooting

### Qdrant Health Check Failures

**Symptom:**
```
ERROR: Qdrant health check failed
```

**Cause:** Qdrant service is not responding to health endpoint requests.

**Solution:**

1. Check Qdrant logs:
```bash
docker logs qdrant-local | tail -50
```

2. Verify Qdrant is responding:
```bash
curl http://localhost:6333/api/health
```

3. If not responding, restart Qdrant:
```bash
docker-compose -f docker-compose.healthcheck.yml restart qdrant-local
```

4. Check resource availability:
```bash
docker stats qdrant-local
```

### Port Conflicts

**Symptom:**
```
Address already in use: 0.0.0.0:6333
```

**Solution:**

1. Identify process using the port:
```bash
lsof -i :6333
```

2. Kill the conflicting process:
```bash
kill -9 <PID>
```

3. Or change the port in docker-compose.yml:
```yaml
qdrant-local:
  ports:
    - "6334:6333"  # Use 6334 instead
```

### MCP Server Not Responding

**Symptom:**
```
curl: (7) Failed to connect to localhost port 5000
```

**Solution:**

1. Check if MCP Server process is running:
```bash
ps aux | grep "npm start"
```

2. Check MCP Server logs:
```bash
tail -50 logs/mcp-server.log
```

3. Restart MCP Server:
```bash
docker-compose -f docker-compose.healthcheck.yml restart mcp-server
```

4. Verify it's listening on port 5000:
```bash
netstat -an | grep 5000
```

### Health Monitor Not Detecting Failures

**Symptom:**
```
Services are down but monitor hasn't restarted them
```

**Solution:**

1. Check if monitor is running:
```bash
ps aux | grep mcp-monitor
```

2. If not running, restart it:
```bash
./scripts/mcp-monitor.sh &
```

3. Check monitor logs:
```bash
tail -50 logs/mcp-monitor.log
```

4. Verify monitor has execute permissions:
```bash
chmod +x scripts/mcp-monitor.sh
```

### Docker Socket Permission Denied

**Symptom:**
```
permission denied while trying to connect to Docker daemon
```

**Solution:**

1. Set Docker socket environment variable:
```bash
export DOCKER_HOST=unix:///Users/$(whoami)/.docker/run/docker.sock
```

2. Or add to your shell profile (~/.zshrc or ~/.bash_profile):
```bash
export DOCKER_HOST=unix:///Users/$(whoami)/.docker/run/docker.sock
```

3. Verify Docker connection:
```bash
docker ps
```

---

## Common Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| Qdrant not responding | `curl: (7) Failed to connect` | Check `docker logs qdrant-local`, verify port 6333 is open, restart service |
| Port already in use | `Address already in use: 0.0.0.0:6333` | Run `lsof -i :6333`, kill conflicting process, or change port in docker-compose.yml |
| MCP Server crashes | `Service mcp-server failed 3 consecutive health checks` | Check `docker logs mcp-server`, verify Qdrant is running, check environment variables |
| High memory usage | `docker stats` shows >80% memory | Reduce `QDRANT_MEM_LIMIT`, check for memory leaks in logs, restart services |
| Network connectivity | `Failed to connect to qdrant-local:6333` | Verify Docker network exists, check `docker network ls`, reconnect container to network |
| Monitor not restarting services | Services down but no restart | Check `ps aux \| grep mcp-monitor`, restart monitor script, check monitor logs |
| Ollama not responding | `curl: (7) Failed to connect to localhost:11434` | Check `docker logs ollama-local`, verify GPU availability, restart Ollama service |
| Prometheus not scraping | Metrics endpoint returns 404 | Verify Prometheus config, check `curl http://localhost:9090/api/v1/targets`, restart Prometheus |
| Grafana dashboard empty | No data in Grafana panels | Verify Prometheus is scraping metrics, check data source configuration, wait for metrics collection |
| Docker compose file not found | `docker-compose.yml: no such file or directory` | Verify you're in correct directory, check file exists with `ls -la docker-compose*.yml` |

---

## Performance Tuning

### Memory Optimization

**Qdrant Memory Configuration:**

Edit `.env` or `docker-compose.yml`:

```bash
# For small deployments (< 1M vectors)
QDRANT_MEM_LIMIT=2g
QDRANT_MEM_RESERVATION=1g

# For medium deployments (1M - 10M vectors)
QDRANT_MEM_LIMIT=4g
QDRANT_MEM_RESERVATION=2g

# For large deployments (> 10M vectors)
QDRANT_MEM_LIMIT=8g
QDRANT_MEM_RESERVATION=4g
```

**Ollama Memory Configuration:**

```bash
# For CPU-only inference
OLLAMA_MEM_LIMIT=2g
OLLAMA_MEM_RESERVATION=1g

# For GPU support
OLLAMA_MEM_LIMIT=4g
OLLAMA_MEM_RESERVATION=2g
```

### CPU Allocation Guidance

**Qdrant CPU:**
- Minimum: 1 CPU core
- Recommended: 2 CPU cores
- High-performance: 4+ CPU cores

**Ollama CPU:**
- Minimum: 1 CPU core
- Recommended: 2 CPU cores (for parallel requests)
- High-performance: 4+ CPU cores

**MCP Server CPU:**
- Minimum: 0.5 CPU cores
- Recommended: 1 CPU core
- High-performance: 2+ CPU cores

### Monitoring Overhead

The health monitor script runs health checks every 30 seconds by default. To adjust:

```bash
# Edit scripts/mcp-monitor.sh
HEALTH_CHECK_INTERVAL=30  # Change to desired interval in seconds
```

**Recommended intervals:**
- Development: 10-15 seconds (faster failure detection)
- Production: 30-60 seconds (reduced overhead)
- High-availability: 5-10 seconds (immediate failure detection)

### Log Rotation

Configure log rotation in `docker-compose.yml`:

```yaml
services:
  qdrant-local:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "10"
        labels: "service=qdrant"
```

**Log rotation settings:**
- `max-size`: Maximum size of a single log file (e.g., "100m", "1g")
- `max-file`: Maximum number of rotated log files to keep
- Adjust based on your storage capacity and retention requirements

---

## Security Best Practices

### Network Isolation

**Docker Network Configuration:**

The deployment uses a dedicated bridge network `qdrant-mcp-network` for service communication:

```bash
# Verify network exists
docker network ls | grep qdrant-mcp-network

# Inspect network
docker network inspect qdrant-mcp-network
```

**Best practices:**
- Do NOT expose Qdrant port (6333) publicly
- Do NOT expose Ollama port (11434) publicly
- Only expose MCP Server port (5000) if needed for external clients
- Use firewall rules to restrict access to exposed ports
- Consider using a reverse proxy (nginx, Traefik) for external access

### Credential Management

**Grafana Default Credentials:**

Change the default admin password in `.env`:

```bash
# Current default
GF_SECURITY_ADMIN_PASSWORD=admin

# Change to strong password
GF_SECURITY_ADMIN_PASSWORD=your-secure-password-here
```

**Best practices:**
- Change default credentials immediately after deployment
- Use strong passwords (minimum 16 characters, mixed case, numbers, symbols)
- Store credentials in a secure vault (e.g., HashiCorp Vault, AWS Secrets Manager)
- Rotate credentials regularly (every 90 days)
- Never commit credentials to version control

### Log Security

**Log File Permissions:**

```bash
# Restrict logs directory to owner only
chmod 700 logs/

# Restrict individual log files
chmod 600 logs/mcp-monitor.log
```

**Sensitive Data in Logs:**

- Monitor logs for sensitive information (API keys, tokens, passwords)
- Configure log level to INFO or WARN in production (not DEBUG)
- Implement log aggregation with encryption (e.g., ELK Stack, Splunk)
- Regularly audit logs for security events
- Archive old logs securely and delete after retention period

### Access Control

**Grafana Access Control:**

By default, Grafana has user sign-up disabled:

```bash
# Verify in docker-compose.yml
GF_USERS_ALLOW_SIGN_UP=false
```

**Best practices:**
- Keep sign-up disabled in production
- Use LDAP/OAuth for enterprise authentication
- Implement role-based access control (RBAC)
- Audit user access and permissions regularly
- Disable unused user accounts

**MCP Server Access Control:**

- Implement authentication for MCP Server endpoints
- Use API keys or JWT tokens for client authentication
- Implement rate limiting to prevent abuse
- Monitor for suspicious access patterns

---

## Post-Deployment Validation Checklist

Use this checklist to verify your deployment is working correctly:

- [ ] **Docker services running:** `docker ps`
  - Verify all services (qdrant-local, ollama-local, prometheus, grafana) are in "Up" state

- [ ] **Qdrant responding:** `curl http://localhost:6333/api/health`
  - Should return `{"status":"ok"}` or similar health status

- [ ] **Ollama responding:** `curl http://localhost:11434/api/tags`
  - Should return list of available models or empty list if no models loaded

- [ ] **MCP Server responding:** `curl http://localhost:5000/mcp`
  - Should return MCP server response (may be 404 if endpoint not implemented, but connection should succeed)

- [ ] **Metrics available:** `curl http://localhost:9091/metrics`
  - Should return Prometheus metrics in text format

- [ ] **Prometheus scraping:** `curl http://localhost:9090/api/v1/targets`
  - Should show targets with "state":"up" for all services

- [ ] **Grafana accessible:** `open http://localhost:3002`
  - Should load Grafana login page, default credentials: admin/admin

- [ ] **Health monitor running:** `ps aux | grep mcp-monitor`
  - Should show mcp-monitor.sh process running

- [ ] **Monitor logs active:** `tail -5 logs/mcp-monitor.log`
  - Should show recent health check entries with timestamps

- [ ] **Qdrant collection exists:** `curl http://localhost:6333/collections`
  - Should return collection list (may be empty if no collections created yet)

**Validation script:**

```bash
#!/bin/bash
echo "=== Post-Deployment Validation ==="
echo ""

echo "1. Docker services:"
docker ps | grep -E "qdrant|ollama|prometheus|grafana|mcp"

echo ""
echo "2. Qdrant health:"
curl -s http://localhost:6333/api/health | jq .

echo ""
echo "3. Ollama models:"
curl -s http://localhost:11434/api/tags | jq .

echo ""
echo "4. MCP Server:"
curl -s http://localhost:5000/mcp || echo "MCP endpoint not available"

echo ""
echo "5. Prometheus metrics:"
curl -s http://localhost:9091/metrics | head -5

echo ""
echo "6. Prometheus targets:"
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .job, state: .health}'

echo ""
echo "7. Health monitor:"
ps aux | grep mcp-monitor | grep -v grep

echo ""
echo "8. Monitor logs (last 5 lines):"
tail -5 logs/mcp-monitor.log

echo ""
echo "9. Qdrant collections:"
curl -s http://localhost:6333/collections | jq .

echo ""
echo "=== Validation Complete ==="
```

Save as `validate-deployment.sh` and run:

```bash
chmod +x validate-deployment.sh
./validate-deployment.sh
```

---

## Next Steps

1. Deploy using the enhanced docker-compose
2. Start the health monitor script
3. Verify all services are healthy
4. Test auto-healing with intentional failures
5. Monitor logs for any issues
6. Adjust configuration as needed for your environment
