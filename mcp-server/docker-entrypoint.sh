#!/bin/sh
# Docker entrypoint script with retry logic and graceful error handling
# Implements exponential backoff for Qdrant connection failures

set -e

# Configuration
MAX_RETRIES=5
INITIAL_DELAY=2
MAX_DELAY=30
CURRENT_DELAY=$INITIAL_DELAY
ATTEMPT=0

# Logging functions
log_info() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1" >&2
}

log_error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

log_warn() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] WARN: $1" >&2
}

# Check if Qdrant is available
check_qdrant() {
  local qdrant_url="${QDRANT_URL:-http://localhost:6333}"
  log_info "Checking Qdrant availability at: $qdrant_url"
  
  if curl -sf "$qdrant_url/api/health" > /dev/null 2>&1; then
    log_info "Qdrant is healthy"
    return 0
  else
    log_warn "Qdrant is not responding"
    return 1
  fi
}

# Wait for Qdrant with exponential backoff
wait_for_qdrant() {
  ATTEMPT=0
  CURRENT_DELAY=$INITIAL_DELAY
  
  while [ $ATTEMPT -lt $MAX_RETRIES ]; do
    ATTEMPT=$((ATTEMPT + 1))
    
    if check_qdrant; then
      log_info "Qdrant connection successful on attempt $ATTEMPT"
      return 0
    fi
    
    if [ $ATTEMPT -lt $MAX_RETRIES ]; then
      log_warn "Qdrant not ready. Retrying in ${CURRENT_DELAY}s (attempt $ATTEMPT/$MAX_RETRIES)"
      sleep $CURRENT_DELAY
      
      # Calculate next delay with exponential backoff (capped at MAX_DELAY)
      CURRENT_DELAY=$((CURRENT_DELAY * 2))
      if [ $CURRENT_DELAY -gt $MAX_DELAY ]; then
        CURRENT_DELAY=$MAX_DELAY
      fi
    fi
  done
  
  log_error "Failed to connect to Qdrant after $MAX_RETRIES attempts"
  return 1
}

# Trap signals for graceful shutdown
trap 'log_info "Received SIGTERM, shutting down gracefully..."; exit 0' TERM
trap 'log_info "Received SIGINT, shutting down gracefully..."; exit 0' INT

# Main startup logic
log_info "Starting MCP Server..."
log_info "Transport mode: ${TRANSPORT_MODE:-stdio}"
log_info "Node environment: ${NODE_ENV:-development}"

# Wait for Qdrant if not in stdio mode
if [ "${TRANSPORT_MODE}" = "http" ]; then
  log_info "HTTP transport mode detected, waiting for Qdrant..."
  if ! wait_for_qdrant; then
    log_error "Cannot start in HTTP mode without Qdrant. Exiting."
    exit 1
  fi
else
  log_info "Stdio transport mode, attempting Qdrant connection..."
  if ! wait_for_qdrant; then
    log_warn "Qdrant not available, but continuing in stdio mode"
  fi
fi

# Start the application
log_info "Starting Node.js application..."
exec npm start
