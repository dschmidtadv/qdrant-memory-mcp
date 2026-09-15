#!/bin/bash
# Embedding Service Diagnostic and Recovery Script
# Diagnoses and fixes common issues with the Ollama embedding service
# Usage: ./scripts/diagnose-embedding-service.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-nomic-embed-text:latest}"
VECTOR_SIZE_LOCAL=768
VECTOR_SIZE_PROD=1024

# Helper functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_ollama_running() {
  log_info "Checking if Ollama container is running..."
  if docker ps --filter "name=ollama-local" --filter "status=running" | grep -q ollama-local; then
    log_success "Ollama container is running"
    return 0
  else
    log_error "Ollama container is not running"
    return 1
  fi
}

check_ollama_responsive() {
  log_info "Checking if Ollama service is responsive..."
  if curl -s "${OLLAMA_URL}/api/tags" > /dev/null 2>&1; then
    log_success "Ollama service is responsive"
    return 0
  else
    log_error "Ollama service is not responding at ${OLLAMA_URL}"
    return 1
  fi
}

list_available_models() {
  log_info "Available models in Ollama:"
  docker exec ollama-local ollama list 2>&1 || log_warning "Could not list models"
}

check_model_present() {
  log_info "Checking if ${OLLAMA_MODEL} is present..."
  if docker exec ollama-local ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
    log_success "Model ${OLLAMA_MODEL} is available"
    return 0
  else
    log_warning "Model ${OLLAMA_MODEL} is not present"
    return 1
  fi
}

pull_embedding_model() {
  log_info "Pulling embedding model ${OLLAMA_MODEL}..."
  log_info "This may take 2-3 minutes on first run. Please be patient..."
  
  if docker exec ollama-local ollama pull "${OLLAMA_MODEL}"; then
    log_success "Successfully pulled ${OLLAMA_MODEL}"
    return 0
  else
    log_error "Failed to pull ${OLLAMA_MODEL}"
    return 1
  fi
}

test_embedding_generation() {
  log_info "Testing embedding generation with sample text..."
  
  RESPONSE=$(curl -s -X POST "${OLLAMA_URL}/api/embeddings" \
    -H "Content-Type: application/json" \
    -d '{"model":"'"${OLLAMA_MODEL}"'","prompt":"test embedding generation"}')
  
  if echo "$RESPONSE" | grep -q '"embedding"'; then
    EMBEDDING=$(echo "$RESPONSE" | jq -r '.embedding')
    EMBEDDING_LENGTH=$(echo "$EMBEDDING" | jq 'length')
    
    if [ "$EMBEDDING_LENGTH" == "$VECTOR_SIZE_LOCAL" ] || [ "$EMBEDDING_LENGTH" == "$VECTOR_SIZE_PROD" ]; then
      log_success "Embedding test passed - generated ${EMBEDDING_LENGTH}-dimensional vector"
      return 0
    else
      log_warning "Embedding has unexpected dimension: ${EMBEDDING_LENGTH} (expected ${VECTOR_SIZE_LOCAL} or ${VECTOR_SIZE_PROD})"
      return 1
    fi
  else
    log_error "Embedding generation failed:"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    return 1
  fi
}

check_mcp_server() {
  log_info "Checking MCP server health..."
  
  # Check if metrics endpoint is responding
  if curl -s http://localhost:9091/metrics > /dev/null 2>&1; then
    log_success "MCP server metrics endpoint is responding"
    return 0
  else
    log_warning "MCP server metrics endpoint not responding at http://localhost:9091/metrics"
    return 1
  fi
}

check_qdrant() {
  log_info "Checking Qdrant vector database..."
  
  if curl -s http://localhost:6333/health > /dev/null 2>&1; then
    log_success "Qdrant is responding"
    return 0
  else
    log_error "Qdrant is not responding at http://localhost:6333"
    return 1
  fi
}

view_ollama_logs() {
  log_info "Recent Ollama logs (last 20 lines):"
  docker logs --tail 20 ollama-local 2>&1 || log_warning "Could not retrieve logs"
}

view_mcp_logs() {
  log_info "Checking for MCP server in docker..."
  if docker ps --filter "name=mcp" --filter "status=running" | grep -q mcp; then
    log_info "MCP server container found. Last 20 log lines:"
    docker logs --tail 20 $(docker ps --filter "name=mcp" -q | head -1) 2>&1 || log_warning "Could not retrieve logs"
  else
    log_warning "No running MCP server container found"
  fi
}

restart_ollama() {
  log_warning "Restarting Ollama container..."
  
  if docker restart ollama-local; then
    log_success "Ollama container restarted successfully"
    sleep 5
    return 0
  else
    log_error "Failed to restart Ollama container"
    return 1
  fi
}

run_full_diagnosis() {
  echo ""
  echo "=========================================="
  echo "  Embedding Service Diagnostic Report"
  echo "=========================================="
  echo ""
  
  OVERALL_STATUS=0
  
  # Phase 1: Container Health
  echo -e "${BLUE}Phase 1: Container Health${NC}"
  echo "---"
  if ! check_ollama_running; then
    OVERALL_STATUS=1
  fi
  echo ""
  
  # Phase 2: Service Connectivity
  echo -e "${BLUE}Phase 2: Service Connectivity${NC}"
  echo "---"
  if ! check_ollama_responsive; then
    OVERALL_STATUS=1
  fi
  echo ""
  
  # Phase 3: Model Availability
  echo -e "${BLUE}Phase 3: Model Availability${NC}"
  echo "---"
  list_available_models
  echo ""
  if ! check_model_present; then
    log_warning "Attempting to pull missing model..."
    if pull_embedding_model; then
      log_success "Model pulled successfully"
    else
      OVERALL_STATUS=1
    fi
  fi
  echo ""
  
  # Phase 4: Embedding Generation
  echo -e "${BLUE}Phase 4: Embedding Generation${NC}"
  echo "---"
  if ! test_embedding_generation; then
    OVERALL_STATUS=1
  fi
  echo ""
  
  # Phase 5: System Integration
  echo -e "${BLUE}Phase 5: System Integration${NC}"
  echo "---"
  check_qdrant
  check_mcp_server
  echo ""
  
  # Phase 6: Logs
  echo -e "${BLUE}Phase 6: Recent Logs${NC}"
  echo "---"
  view_ollama_logs
  echo ""
  view_mcp_logs
  echo ""
  
  # Summary
  echo "=========================================="
  if [ $OVERALL_STATUS -eq 0 ]; then
    log_success "All diagnostics passed! Embedding service is healthy."
  else
    log_error "Some diagnostics failed. Review the output above."
  fi
  echo "=========================================="
  echo ""
  
  return $OVERALL_STATUS
}

# Main script
main() {
  case "${1:-diagnose}" in
    diagnose)
      run_full_diagnosis
      ;;
    restart)
      restart_ollama
      log_info "Waiting for service to stabilize..."
      sleep 3
      run_full_diagnosis
      ;;
    pull-model)
      if ! check_ollama_running; then
        log_error "Ollama container is not running. Start it first."
        exit 1
      fi
      if ! check_ollama_responsive; then
        log_error "Ollama service is not responsive. Restart the container."
        exit 1
      fi
      pull_embedding_model
      ;;
    test)
      if ! check_ollama_responsive; then
        log_error "Ollama service is not responding"
        exit 1
      fi
      test_embedding_generation
      ;;
    logs)
      view_ollama_logs
      view_mcp_logs
      ;;
    *)
      echo "Embedding Service Diagnostic Tool"
      echo ""
      echo "Usage: $0 [command]"
      echo ""
      echo "Commands:"
      echo "  diagnose     Run full diagnostic (default)"
      echo "  restart      Restart Ollama container and run diagnostics"
      echo "  pull-model   Manually pull the embedding model"
      echo "  test         Test embedding generation"
      echo "  logs         View recent logs from Ollama and MCP"
      echo ""
      exit 1
      ;;
  esac
}

main "$@"
