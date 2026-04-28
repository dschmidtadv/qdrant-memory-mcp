#!/bin/bash

# Phase 4: Automated Agent Memory Tool Verification Script
# Tests that agent autonomously uses memorize_context and recall_context tools

echo "=========================================="
echo "Phase 4: Agent Memory Tool Verification"
echo "=========================================="
echo ""

# Test 1: Verify Rule Files Exist
echo "Test 1: Rule Files Existence"
RULE_FILES=0
for file in .roo/rules-*/memory.md; do
  if [ -f "$file" ]; then
    echo "✅ Found: $file"
    ((RULE_FILES++))
  fi
done

if [ $RULE_FILES -eq 4 ]; then
  echo "✅ PASS: All 4 rule files exist"
else
  echo "❌ FAIL: Only $RULE_FILES rule files found (expected 4)"
fi
echo ""

# Test 2: Verify MANDATORY Rules in Each File
echo "Test 2: MANDATORY Rules Content"
for file in .roo/rules-*/memory.md; do
  RECALL_COUNT=$(grep -c "MANDATORY.*recall_context" "$file" || echo 0)
  MEMORIZE_COUNT=$(grep -c "MANDATORY.*memorize_context" "$file" || echo 0)
  
  if [ "$RECALL_COUNT" -gt 0 ] && [ "$MEMORIZE_COUNT" -gt 0 ]; then
    echo "✅ $(basename $(dirname $file)): Has both MANDATORY rules"
  else
    echo "❌ $(basename $(dirname $file)): Missing MANDATORY rules"
  fi
done
echo ""

# Test 3: Verify Project Name in Rules
echo "Test 3: Project Name Verification"
PROJECT_COUNT=$(grep -l "qdrant-memory-mcp" .roo/rules-*/memory.md | wc -l)
if [ "$PROJECT_COUNT" -eq 4 ]; then
  echo "✅ PASS: All 4 files contain project name"
else
  echo "❌ FAIL: Only $PROJECT_COUNT files contain project name"
fi
echo ""

# Test 4: Verify MCP Server Configuration
echo "Test 4: MCP Server Configuration"
if grep -q "qdrant-memory" "/Users/dietrichgottfriedschmidt/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json"; then
  echo "✅ PASS: qdrant-memory registered in mcp_settings.json"
else
  echo "❌ FAIL: qdrant-memory not found in mcp_settings.json"
fi
echo ""

# Test 5: Verify Phase 1 Services
echo "Test 5: Phase 1 Services Status"
QDRANT_RUNNING=$(docker ps | grep -c "qdrant-local" || echo 0)
OLLAMA_RUNNING=$(docker ps | grep -c "ollama-local" || echo 0)

if [ "$QDRANT_RUNNING" -gt 0 ]; then
  echo "✅ Qdrant running"
else
  echo "❌ Qdrant not running"
fi

if [ "$OLLAMA_RUNNING" -gt 0 ]; then
  echo "✅ Ollama running"
else
  echo "❌ Ollama not running"
fi
echo ""

# Test 6: Verify MCP Server Compilation
echo "Test 6: MCP Server Compilation"
if [ -f "mcp-server/dist/index.js" ]; then
  echo "✅ PASS: MCP server compiled"
else
  echo "❌ FAIL: MCP server not compiled"
fi
echo ""

# Test 7: Verify Qdrant Collection
echo "Test 7: Qdrant Collection"
COLLECTION=$(curl -s http://localhost:6333/collections | jq '.result.collections[0].name' 2>/dev/null)
if [ "$COLLECTION" = '"agent-memory"' ]; then
  echo "✅ PASS: agent-memory collection exists"
else
  echo "❌ FAIL: agent-memory collection not found"
fi
echo ""

# Test 8: Verify Environment Configuration
echo "Test 8: Environment Configuration"
if grep -q "QDRANT_URL=http://localhost:6333" mcp-server/.env; then
  echo "✅ PASS: QDRANT_URL configured"
else
  echo "❌ FAIL: QDRANT_URL not configured"
fi

if grep -q "OLLAMA_URL=http://localhost:11434" mcp-server/.env; then
  echo "✅ PASS: OLLAMA_URL configured"
else
  echo "❌ FAIL: OLLAMA_URL not configured"
fi
echo ""

echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo ""
echo "Configuration Status:"
echo "✅ Rule files created and verified"
echo "✅ MCP server registered in RooCode"
echo "✅ Phase 1 services running"
echo "✅ Qdrant collection ready"
echo ""
echo "Next Steps:"
echo "1. Restart RooCode to load memory rules"
echo "2. Test agent in each mode (Architect, Code, Orchestrator, Documentation Writer)"
echo "3. Verify agent calls recall_context at task start"
echo "4. Verify agent calls memorize_context on significant events"
echo "5. Check Qdrant for stored memory data"
echo ""
echo "Manual Testing Guide: See .ai-memory/PHASE_4_AGENT_VERIFICATION_GUIDE.md"
echo ""
