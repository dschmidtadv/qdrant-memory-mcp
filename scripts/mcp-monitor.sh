#!/bin/bash
# MCP Server Health Monitor and Auto-Healer
# Monitors service health and automatically restarts failed services
# Implements exponential backoff and comprehensive logging

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/mcp-monitor.log"
HEALTH_CHECK_INTERVAL=30
MAX_CONSECUTIVE_FAILURES=3
RESTART_DELAY=5
MAX_RESTART_DELAY=300

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Logging functions
log_info() {
  local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] INFO: $1" | tee -a "$LOG_FILE"
}

log_error() {
  local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] ERROR: $1" | tee -a "$LOG_FILE"
}

log_warn() {
  local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] WARN: $1" | tee -a "$LOG_FILE"
}

# Check if Docker service is running
is_docker_service_running() {
  local service=$1
  docker ps --filter "name=$service" --filter "status=running" | grep -q "$service"
}

# Check if Node.js process is running
is_node_process_running() {
  ps aux | grep -E "npm start|node.*mcp" | grep -v grep > /dev/null
}

# Check if service is running
is_service_running() {
  local service=$1
  if [ "$service" = "mcp-server" ]; then
    is_node_process_running
  else
    is_docker_service_running "$service"
  fi
}

# Check service health
check_service_health() {
  local service=$1
  local health_endpoint=$2
  
  if ! is_service_running "$service"; then
    log_error "Service $service is not running"
    return 1
  fi
  
  if ! curl -sf "$health_endpoint" > /dev/null 2>&1; then
    log_error "Service $service health check failed at $health_endpoint"
    return 1
  fi
  
  log_info "Service $service is healthy"
  return 0
}

# Restart service with exponential backoff
restart_service() {
  local service=$1
  local restart_delay=$2
  
  log_warn "Restarting service $service (delay: ${restart_delay}s)"
  sleep "$restart_delay"
  
  if [ "$service" = "mcp-server" ]; then
    # Restart Node.js MCP Server process
    pkill -f "npm start" 2>/dev/null || true
    sleep 2
    cd "$PROJECT_DIR/mcp-server" && TRANSPORT_MODE=http npm start > /dev/null 2>&1 &
    sleep 3
    if is_node_process_running; then
      log_info "Successfully restarted service $service"
      return 0
    else
      log_error "Failed to restart service $service"
      return 1
    fi
  else
    # Restart Docker service
    if docker restart "$service" > /dev/null 2>&1; then
      log_info "Successfully restarted service $service"
      return 0
    else
      log_error "Failed to restart service $service"
      return 1
    fi
  fi
}

# Monitor service with auto-healing
monitor_service() {
  local service=$1
  local health_endpoint=$2
  local consecutive_failures=0
  local restart_delay=$RESTART_DELAY
  
  log_info "Starting monitoring for service: $service"
  
  while true; do
    if check_service_health "$service" "$health_endpoint"; then
      consecutive_failures=0
      restart_delay=$RESTART_DELAY
    else
      consecutive_failures=$((consecutive_failures + 1))
      
      if [ $consecutive_failures -ge $MAX_CONSECUTIVE_FAILURES ]; then
        log_error "Service $service failed $consecutive_failures consecutive health checks"
        
        if restart_service "$service" "$restart_delay"; then
          consecutive_failures=0
          # Exponential backoff for next restart
          restart_delay=$((restart_delay * 2))
          if [ $restart_delay -gt $MAX_RESTART_DELAY ]; then
            restart_delay=$MAX_RESTART_DELAY
          fi
        else
          log_error "Failed to restart $service, will retry in ${restart_delay}s"
        fi
      fi
    fi
    
    sleep "$HEALTH_CHECK_INTERVAL"
  done
}

# Cleanup on exit
cleanup() {
  log_info "Monitor shutting down gracefully..."
  exit 0
}

trap cleanup SIGTERM SIGINT

# Main monitoring loop
log_info "MCP Server Health Monitor started"
log_info "Health check interval: ${HEALTH_CHECK_INTERVAL}s"
log_info "Max consecutive failures before restart: $MAX_CONSECUTIVE_FAILURES"

# Monitor all services
monitor_service "qdrant-local" "http://localhost:6333/collections" &
QDRANT_PID=$!

monitor_service "mcp-server" "http://localhost:9091/metrics" &
MCP_PID=$!

monitor_service "ollama-local" "http://localhost:11434/api/tags" &
OLLAMA_PID=$!

# Wait for all monitoring processes
wait
