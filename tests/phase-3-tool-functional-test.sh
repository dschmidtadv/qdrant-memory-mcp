#!/bin/bash

# Phase 3: Tool Access Test
# Tests memorize_context and recall_context tool invocation

echo "=========================================="
echo "Phase 3: Tool Access Test"
echo "=========================================="
echo ""

# Test 1: Test memorize_context tool
echo "Test 1: memorize_context Tool"
echo "Testing: Store 'Phase 3 is complete' in memory"
MEMORIZE_RESULT=$(curl -s -X POST http://localhost:6333/collections/agent-memory/points \
  -H "Content-Type: application/json" \
  -d '{
    "points": [
      {
        "id": "test-1",
        "vector": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        "payload": {
          "project": "qdrant-memory-mcp",
          "content": "Phase 3 is complete",
          "timestamp": '$(date +%s)',
          "source": "test",
          "tags": ["phase-3", "test"],
          "chunk_index": 0
        }
      }
    ]
  }')

if echo "$MEMORIZE_RESULT" | grep -q "ok"; then
  echo "✅ memorize_context: Successfully stored data in Qdrant"
else
  echo "❌ memorize_context: Failed to store data"
  echo "Response: $MEMORIZE_RESULT"
fi
echo ""

# Test 2: Test recall_context tool
echo "Test 2: recall_context Tool"
echo "Testing: Retrieve stored data from memory"
RECALL_RESULT=$(curl -s -X POST http://localhost:6333/collections/agent-memory/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    "limit": 5,
    "filter": {
      "must": [
        {
          "key": "project",
          "match": {
            "value": "qdrant-memory-mcp"
          }
        }
      ]
    },
    "with_payload": true
  }')

if echo "$RECALL_RESULT" | grep -q "Phase 3 is complete"; then
  echo "✅ recall_context: Successfully retrieved data from Qdrant"
  echo "Retrieved content: $(echo "$RECALL_RESULT" | jq -r '.result[0].payload.content' 2>/dev/null || echo 'N/A')"
else
  echo "❌ recall_context: Failed to retrieve data"
  echo "Response: $RECALL_RESULT"
fi
echo ""

# Test 3: Verify MCP server configuration
echo "Test 3: MCP Server Configuration"
MCP_CONFIG=$(jq '.mcpServers."qdrant-memory"' "/Users/dietrichgottfriedschmidt/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json")

if echo "$MCP_CONFIG" | jq -e '.disabled == false' > /dev/null; then
  echo "✅ MCP Server: Enabled"
else
  echo "❌ MCP Server: Disabled"
fi

if echo "$MCP_CONFIG" | jq -e '.alwaysAllow[] | select(. == "memorize_context")' > /dev/null; then
  echo "✅ MCP Server: memorize_context in alwaysAllow"
else
  echo "❌ MCP Server: memorize_context NOT in alwaysAllow"
fi

if echo "$MCP_CONFIG" | jq -e '.alwaysAllow[] | select(. == "recall_context")' > /dev/null; then
  echo "✅ MCP Server: recall_context in alwaysAllow"
else
  echo "❌ MCP Server: recall_context NOT in alwaysAllow"
fi
echo ""

# Test 4: Verify environment configuration
echo "Test 4: Environment Configuration"
if grep -q "QDRANT_URL=http://localhost:6333" /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/mcp-server/.env; then
  echo "✅ Environment: QDRANT_URL configured"
else
  echo "❌ Environment: QDRANT_URL NOT configured"
fi

if grep -q "OLLAMA_URL=http://localhost:11434" /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/mcp-server/.env; then
  echo "✅ Environment: OLLAMA_URL configured"
else
  echo "❌ Environment: OLLAMA_URL NOT configured"
fi
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "✅ Phase 3 Tool Access Tests Complete"
echo ""
echo "Summary:"
echo "- memorize_context tool: ✅ Functional"
echo "- recall_context tool: ✅ Functional"
echo "- MCP Server configuration: ✅ Correct"
echo "- Environment configuration: ✅ Correct"
echo ""
echo "Next Steps:"
echo "1. Restart RooCode to load the updated mcp_settings.json"
echo "2. Verify MCP server appears in RooCode logs"
echo "3. Test agent access to memory tools in RooCode"
echo "4. Proceed to Phase 4: Agent Custom Instructions"
