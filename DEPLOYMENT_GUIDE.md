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

## Next Steps

1. Deploy using the enhanced docker-compose
2. Start the health monitor script
3. Verify all services are healthy
4. Test auto-healing with intentional failures
5. Monitor logs for any issues
6. Adjust configuration as needed for your environment
