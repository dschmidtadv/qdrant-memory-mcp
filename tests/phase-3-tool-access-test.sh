#!/bin/bash

# Phase 3 MCP Server Tool Access Test
# Tests that memorize_context and recall_context tools are accessible

echo "=========================================="
echo "Phase 3: MCP Server Tool Access Test"
echo "=========================================="
echo ""

# Test 1: Verify MCP server can start
echo "Test 1: MCP Server Startup"
timeout 3 node /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/mcp-server/dist/index.js 2>&1 | grep -E "(Qdrant initialized|Available tools|MCP Server)" || echo "❌ Server startup failed"
echo ""

# Test 2: Verify tools are listed
echo "Test 2: Tools Available"
TOOLS=$(timeout 3 node /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/mcp-server/dist/index.js 2>&1 | grep "Available tools")
if echo "$TOOLS" | grep -q "memorize_context"; then
  echo "✅ memorize_context tool available"
else
  echo "❌ memorize_context tool NOT found"
fi

if echo "$TOOLS" | grep -q "recall_context"; then
  echo "✅ recall_context tool available"
else
  echo "❌ recall_context tool NOT found"
fi
echo ""

# Test 3: Verify Qdrant connectivity
echo "Test 3: Qdrant Connectivity"
QDRANT_CHECK=$(curl -s http://localhost:6333/collections | jq '.result.collections | length')
if [ "$QDRANT_CHECK" -gt 0 ]; then
  echo "✅ Qdrant accessible with $QDRANT_CHECK collection(s)"
else
  echo "❌ Qdrant not accessible"
fi
echo ""

# Test 4: Verify mcp_settings.json configuration
echo "Test 4: mcp_settings.json Configuration"
MCP_ENTRY=$(jq '.mcpServers."qdrant-memory"' "/Users/dietrichgottfriedschmidt/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json")
if echo "$MCP_ENTRY" | grep -q "memorize_context"; then
  echo "✅ memorize_context in alwaysAllow list"
else
  echo "❌ memorize_context NOT in alwaysAllow list"
fi

if echo "$MCP_ENTRY" | grep -q "recall_context"; then
  echo "✅ recall_context in alwaysAllow list"
else
  echo "❌ recall_context NOT in alwaysAllow list"
fi
echo ""

# Test 5: Verify environment variables
echo "Test 5: Environment Variables"
if grep -q "QDRANT_URL" /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/mcp-server/.env; then
  echo "✅ QDRANT_URL configured"
else
  echo "❌ QDRANT_URL NOT configured"
fi

if grep -q "OLLAMA_URL" /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/mcp-server/.env; then
  echo "✅ OLLAMA_URL configured"
else
  echo "❌ OLLAMA_URL NOT configured"
fi
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "✅ Phase 3 MCP Server Tool Access Tests Complete"
echo ""
echo "Next Steps:"
echo "1. Restart RooCode to load the updated mcp_settings.json"
echo "2. Verify MCP server appears in RooCode logs"
echo "3. Test agent access to memory tools"
echo "4. Proceed to Phase 4: Agent Custom Instructions"
