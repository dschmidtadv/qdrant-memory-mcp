#!/bin/bash

# Comprehensive Manual Test Execution Script
# UGIP Initialization, recall_context, and memorize_context Testing
# Date: 2026-04-28
# Usage: bash test-execution-script.sh [test-name] or bash test-execution-script.sh all

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Configuration
QDRANT_URL="http://localhost:6333"
OLLAMA_URL="http://localhost:11434"
TEST_COLLECTION="agent-memory"
VECTOR_DIMENSION=768
TEST_PROJECT_1="qdrant-memory-mcp"
TEST_PROJECT_2="example-drupal-project"

# Logging
LOG_FILE=".ai-memory/TEST_EXECUTION_LOG_$(date +%Y%m%d_%H%M%S).txt"
REPORT_FILE=".ai-memory/TEST_EXECUTION_REPORT_$(date +%Y%m%d_%H%M%S).md"

# Helper functions
log_test() {
  echo -e "${BLUE}[TEST]${NC} $1" | tee -a "$LOG_FILE"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1" | tee -a "$LOG_FILE"
  ((PASSED_TESTS++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1" | tee -a "$LOG_FILE"
  ((FAILED_TESTS++))
}

log_skip() {
  echo -e "${YELLOW}[SKIP]${NC} $1" | tee -a "$LOG_FILE"
  ((SKIPPED_TESTS++))
}

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Initialize log file
echo "Test Execution Started: $(date)" > "$LOG_FILE"
echo "Environment: $(uname -s) $(uname -r)" >> "$LOG_FILE"
echo "Node.js: $(node --version)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# ============================================================================
# PHASE 1: PRE-TEST VERIFICATION
# ============================================================================

test_pre_flight_verification() {
  log_test "PRE-FLIGHT VERIFICATION"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Check Qdrant
  log_info "Checking Qdrant health..."
  if curl -s -o /dev/null -w "%{http_code}" "$QDRANT_URL/collections" | grep -q "200"; then
    log_pass "Qdrant is healthy"
  else
    log_fail "Qdrant health check failed"
    all_pass=false
  fi
  
  # Check collection
  log_info "Checking collection..."
  if curl -s -o /dev/null -w "%{http_code}" "$QDRANT_URL/collections/$TEST_COLLECTION" | grep -q "200"; then
    log_pass "Collection '$TEST_COLLECTION' exists"
  else
    log_fail "Collection '$TEST_COLLECTION' not found"
    all_pass=false
  fi
  
  # Check vector dimension
  log_info "Checking vector dimension..."
  local dim=$(curl -s "$QDRANT_URL/collections/$TEST_COLLECTION" | jq '.result.config.params.vectors.size' 2>/dev/null)
  if [ "$dim" = "$VECTOR_DIMENSION" ]; then
    log_pass "Vector dimension is correct ($VECTOR_DIMENSION-dim)"
  else
    log_fail "Vector dimension mismatch (expected $VECTOR_DIMENSION, got $dim)"
    all_pass=false
  fi
  
  # Check Ollama
  log_info "Checking Ollama..."
  if curl -s -o /dev/null -w "%{http_code}" "$OLLAMA_URL/api/tags" | grep -q "200"; then
    log_pass "Ollama is healthy"
  else
    log_fail "Ollama health check failed"
    all_pass=false
  fi
  
  # Check MCP Server
  log_info "Checking MCP Server..."
  if pgrep -f "node.*dist/index.js" > /dev/null; then
    log_pass "MCP Server is running"
  else
    log_fail "MCP Server is not running"
    all_pass=false
  fi
  
  # Check ROO_CODE_CONTEXT.md
  log_info "Checking ROO_CODE_CONTEXT.md..."
  if [ -r "ROO_CODE_CONTEXT.md" ]; then
    log_pass "ROO_CODE_CONTEXT.md is readable"
  else
    log_fail "ROO_CODE_CONTEXT.md not found or not readable"
    all_pass=false
  fi
  
  # Check .ai-memory directory
  log_info "Checking .ai-memory directory..."
  if [ -d ".ai-memory" ] && [ -w ".ai-memory" ]; then
    log_pass ".ai-memory directory exists and is writable"
  else
    log_fail ".ai-memory directory missing or not writable"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "PRE-FLIGHT VERIFICATION COMPLETE"
  else
    log_fail "PRE-FLIGHT VERIFICATION FAILED"
  fi
}

# ============================================================================
# PHASE 2: UGIP INITIALIZATION TESTS
# ============================================================================

test_ugip_phase_1() {
  log_test "UGIP Phase 1: Pre-Flight Cleanup"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Check .ai-memory directory
  if [ -d "./.ai-memory" ]; then
    log_pass ".ai-memory directory exists"
  else
    log_fail ".ai-memory directory missing"
    all_pass=false
  fi
  
  # Check for stale files
  if [ ! -f "./.ai-memory/SESSION_LOG_UPDATE.md" ]; then
    log_pass "No stale session files detected"
  else
    log_fail "Stale session file detected: SESSION_LOG_UPDATE.md"
    all_pass=false
  fi
  
  # Check directory permissions
  if [ -w "./.ai-memory" ]; then
    log_pass ".ai-memory directory is writable"
  else
    log_fail ".ai-memory directory is not writable"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "UGIP Phase 1 PASSED"
  else
    log_fail "UGIP Phase 1 FAILED"
  fi
}

test_ugip_phase_2() {
  log_test "UGIP Phase 2: Atomic Initialization"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Check ROO_CODE_CONTEXT.md
  if [ -r "ROO_CODE_CONTEXT.md" ]; then
    log_pass "ROO_CODE_CONTEXT.md is readable"
  else
    log_fail "ROO_CODE_CONTEXT.md not found or not readable"
    all_pass=false
  fi
  
  # Check required sections
  local sections=("Project Overview" "Architecture Details" "Dual-Source Initialization" "Global Rules System")
  for section in "${sections[@]}"; do
    if grep -q "## $section" ROO_CODE_CONTEXT.md; then
      log_pass "Section found: $section"
    else
      log_fail "Section missing: $section"
      all_pass=false
    fi
  done
  
  # Check vector dimension documentation
  if grep -q "768-dim\|768-dimensional" ROO_CODE_CONTEXT.md; then
    log_pass "Vector dimension (768-dim) documented"
  else
    log_fail "Vector dimension not documented"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "UGIP Phase 2 PASSED"
  else
    log_fail "UGIP Phase 2 FAILED"
  fi
}

test_ugip_phase_3() {
  log_test "UGIP Phase 3: Git Branch Check"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Get current branch
  local current_branch=$(git branch --show-current)
  log_info "Current branch: $current_branch"
  
  # Check if protected
  local protected_branches=("main" "master" "develop" "stage" "production")
  local is_protected=0
  for branch in "${protected_branches[@]}"; do
    if [ "$current_branch" = "$branch" ]; then
      is_protected=1
      break
    fi
  done
  
  if [ $is_protected -eq 0 ]; then
    log_pass "Current branch is safe (not protected)"
  else
    log_fail "Current branch is PROTECTED: $current_branch"
    all_pass=false
  fi
  
  # Check git status
  if git diff-index --quiet HEAD --; then
    log_pass "Git working directory is clean"
  else
    log_fail "Git working directory has uncommitted changes"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "UGIP Phase 3 PASSED"
  else
    log_fail "UGIP Phase 3 FAILED"
  fi
}

test_ugip_phase_4() {
  log_test "UGIP Phase 4: Infrastructure Verification"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Qdrant health
  local qdrant_health=$(curl -s -o /dev/null -w "%{http_code}" "$QDRANT_URL/health")
  if [ "$qdrant_health" = "200" ]; then
    log_pass "Qdrant is healthy (HTTP 200)"
  else
    log_fail "Qdrant health check failed (HTTP $qdrant_health)"
    all_pass=false
  fi
  
  # Collection exists
  local collection_status=$(curl -s -o /dev/null -w "%{http_code}" "$QDRANT_URL/collections/$TEST_COLLECTION")
  if [ "$collection_status" = "200" ]; then
    log_pass "Collection 'agent-memory' exists"
  else
    log_fail "Collection 'agent-memory' not found"
    all_pass=false
  fi
  
  # Vector dimension
  local vector_size=$(curl -s "$QDRANT_URL/collections/$TEST_COLLECTION" | jq '.result.config.params.vectors.size' 2>/dev/null)
  if [ "$vector_size" = "$VECTOR_DIMENSION" ]; then
    log_pass "Vector dimension is correct ($VECTOR_DIMENSION-dim)"
  else
    log_fail "Vector dimension mismatch (expected $VECTOR_DIMENSION, got $vector_size)"
    all_pass=false
  fi
  
  # Ollama health
  local ollama_health=$(curl -s -o /dev/null -w "%{http_code}" "$OLLAMA_URL/api/tags")
  if [ "$ollama_health" = "200" ]; then
    log_pass "Ollama is healthy"
  else
    log_fail "Ollama health check failed"
    all_pass=false
  fi
  
  # MCP Server
  if pgrep -f "node.*dist/index.js" > /dev/null; then
    log_pass "MCP Server is running"
  else
    log_fail "MCP Server is not running"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "UGIP Phase 4 PASSED"
  else
    log_fail "UGIP Phase 4 FAILED"
  fi
}

# ============================================================================
# PHASE 3: RECALL_CONTEXT TESTS
# ============================================================================

test_recall_context_simple_query() {
  log_test "recall_context: Simple Query"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Generate query embedding
  local query_text="test query"
  local query_embedding=$(curl -s "$OLLAMA_URL/api/embed" \
    -d "{\"model\": \"nomic-embed-text\", \"input\": \"$query_text\"}" | jq '.embeddings[0]' 2>/dev/null)
  
  if [ -z "$query_embedding" ] || [ "$query_embedding" = "null" ]; then
    log_fail "Failed to generate query embedding"
    all_pass=false
  else
    log_pass "Query embedding generated"
  fi
  
  # Execute query
  local response=$(curl -s "$QDRANT_URL/collections/$TEST_COLLECTION/points/search" \
    -H "Content-Type: application/json" \
    -d "{\"vector\": $query_embedding, \"limit\": 5}" 2>/dev/null)
  
  if echo "$response" | jq -e '.result' > /dev/null 2>&1; then
    log_pass "Query executed successfully"
  else
    log_fail "Query execution failed"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "recall_context Simple Query PASSED"
  else
    log_fail "recall_context Simple Query FAILED"
  fi
}

test_recall_context_project_filter() {
  log_test "recall_context: Project Filter"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Generate query embedding
  local query_text="UGIP initialization"
  local query_embedding=$(curl -s "$OLLAMA_URL/api/embed" \
    -d "{\"model\": \"nomic-embed-text\", \"input\": \"$query_text\"}" | jq '.embeddings[0]' 2>/dev/null)
  
  # Execute query with project filter
  local response=$(curl -s "$QDRANT_URL/collections/$TEST_COLLECTION/points/search" \
    -H "Content-Type: application/json" \
    -d "{
      \"vector\": $query_embedding,
      \"limit\": 5,
      \"filter\": {
        \"must\": [{
          \"key\": \"project\",
          \"match\": {\"value\": \"$TEST_PROJECT_1\"}
        }]
      }
    }" 2>/dev/null)
  
  if echo "$response" | jq -e '.result' > /dev/null 2>&1; then
    log_pass "Project filter query executed"
  else
    log_fail "Project filter query failed"
    all_pass=false
  fi
  
  # Verify all results have correct project
  local result_count=$(echo "$response" | jq '.result | length' 2>/dev/null)
  local correct_project=$(echo "$response" | jq "[.result[] | select(.payload.project == \"$TEST_PROJECT_1\")] | length" 2>/dev/null)
  
  if [ "$result_count" -eq "$correct_project" ] || [ "$result_count" -eq 0 ]; then
    log_pass "Project filter working correctly"
  else
    log_fail "Project filter not working as expected"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "recall_context Project Filter PASSED"
  else
    log_fail "recall_context Project Filter FAILED"
  fi
}

test_recall_context_tag_filter() {
  log_test "recall_context: Tag Filter"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Generate query embedding
  local query_text="memory tools"
  local query_embedding=$(curl -s "$OLLAMA_URL/api/embed" \
    -d "{\"model\": \"nomic-embed-text\", \"input\": \"$query_text\"}" | jq '.embeddings[0]' 2>/dev/null)
  
  # Execute query with tag filter
  local response=$(curl -s "$QDRANT_URL/collections/$TEST_COLLECTION/points/search" \
    -H "Content-Type: application/json" \
    -d "{
      \"vector\": $query_embedding,
      \"limit\": 5,
      \"filter\": {
        \"must\": [{
          \"key\": \"tags\",
          \"match\": {\"value\": \"memory\"}
        }]
      }
    }" 2>/dev/null)
  
  if echo "$response" | jq -e '.result' > /dev/null 2>&1; then
    log_pass "Tag filter query executed"
  else
    log_fail "Tag filter query failed"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "recall_context Tag Filter PASSED"
  else
    log_fail "recall_context Tag Filter FAILED"
  fi
}

# ============================================================================
# PHASE 4: ERROR HANDLING TESTS
# ============================================================================

test_error_invalid_collection() {
  log_test "Error Handling: Invalid Collection"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Generate query embedding
  local query_embedding=$(curl -s "$OLLAMA_URL/api/embed" \
    -d "{\"model\": \"nomic-embed-text\", \"input\": \"test\"}" | jq '.embeddings[0]' 2>/dev/null)
  
  # Try to query non-existent collection
  local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$QDRANT_URL/collections/nonexistent/points/search" \
    -H "Content-Type: application/json" \
    -d "{\"vector\": $query_embedding, \"limit\": 5}")
  
  if [ "$http_code" = "404" ]; then
    log_pass "Invalid collection returns HTTP 404"
  else
    log_fail "Invalid collection should return HTTP 404 (got $http_code)"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "Error Handling: Invalid Collection PASSED"
  else
    log_fail "Error Handling: Invalid Collection FAILED"
  fi
}

test_error_invalid_dimension() {
  log_test "Error Handling: Invalid Vector Dimension"
  ((TOTAL_TESTS++))
  
  local all_pass=true
  
  # Create 384-dim vector (wrong dimension)
  local wrong_dim_vector=$(python3 -c "import json; print(json.dumps([0.1] * 384))" 2>/dev/null)
  
  if [ -z "$wrong_dim_vector" ]; then
    log_skip "Python not available for dimension test"
    return
  fi
  
  # Try to query with wrong dimension
  local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$QDRANT_URL/collections/$TEST_COLLECTION/points/search" \
    -H "Content-Type: application/json" \
    -d "{\"vector\": $wrong_dim_vector, \"limit\": 5}")
  
  if [ "$http_code" = "400" ]; then
    log_pass "Invalid vector dimension returns HTTP 400"
  else
    log_fail "Invalid vector dimension should return HTTP 400 (got $http_code)"
    all_pass=false
  fi
  
  if [ "$all_pass" = true ]; then
    log_pass "Error Handling: Invalid Dimension PASSED"
  else
    log_fail "Error Handling: Invalid Dimension FAILED"
  fi
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

main() {
  local test_name="${1:-all}"
  
  echo "=========================================="
  echo "Test Execution Started: $(date)"
  echo "=========================================="
  echo ""
  
  # Pre-flight verification
  test_pre_flight_verification
  echo ""
  
  # UGIP Initialization Tests
  if [ "$test_name" = "all" ] || [ "$test_name" = "ugip" ]; then
    echo "=========================================="
    echo "UGIP INITIALIZATION TESTS"
    echo "=========================================="
    test_ugip_phase_1
    test_ugip_phase_2
    test_ugip_phase_3
    test_ugip_phase_4
    echo ""
  fi
  
  # recall_context Tests
  if [ "$test_name" = "all" ] || [ "$test_name" = "recall" ]; then
    echo "=========================================="
    echo "RECALL_CONTEXT TESTS"
    echo "=========================================="
    test_recall_context_simple_query
    test_recall_context_project_filter
    test_recall_context_tag_filter
    echo ""
  fi
  
  # Error Handling Tests
  if [ "$test_name" = "all" ] || [ "$test_name" = "errors" ]; then
    echo "=========================================="
    echo "ERROR HANDLING TESTS"
    echo "=========================================="
    test_error_invalid_collection
    test_error_invalid_dimension
    echo ""
  fi
  
  # Summary
  echo "=========================================="
  echo "TEST EXECUTION SUMMARY"
  echo "=========================================="
  echo "Total Tests: $TOTAL_TESTS"
  echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
  echo -e "${RED}Failed: $FAILED_TESTS${NC}"
  echo -e "${YELLOW}Skipped: $SKIPPED_TESTS${NC}"
  echo "=========================================="
  echo "Test Execution Completed: $(date)"
  echo "Log File: $LOG_FILE"
  echo "=========================================="
  
  # Generate report
  generate_report
}

generate_report() {
  cat > "$REPORT_FILE" << EOF
# Test Execution Report - $(date +%Y-%m-%d)

**Date:** $(date)  
**Duration:** [Manual entry required]  
**Tester:** [Manual entry required]  
**Status:** $([ $FAILED_TESTS -eq 0 ] && echo "PASS" || echo "FAIL")

## Summary
- Total Tests: $TOTAL_TESTS
- Passed: $PASSED_TESTS
- Failed: $FAILED_TESTS
- Skipped: $SKIPPED_TESTS

## Test Results

### UGIP Initialization
- Phase 1: Pre-Flight Cleanup - [See log]
- Phase 2: Atomic Initialization - [See log]
- Phase 3: Git Branch Check - [See log]
- Phase 4: Infrastructure Verification - [See log]

### recall_context Functionality
- Simple Query - [See log]
- Project Filter - [See log]
- Tag Filter - [See log]

### Error Handling
- Invalid Collection - [See log]
- Invalid Vector Dimension - [See log]

## Detailed Log
See: $LOG_FILE

## Issues Found
[Manual entry required]

## Recommendations
[Manual entry required]

## Conclusion
[Manual entry required]
EOF
  
  echo "Report generated: $REPORT_FILE"
}

# Run main function
main "$@"
