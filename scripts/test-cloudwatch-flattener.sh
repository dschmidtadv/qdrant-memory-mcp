#!/bin/bash

# Test script to debug CloudWatch schema flattener
# Enables debug logging and captures output

echo "=== Testing CloudWatch Schema Flattener ==="
echo ""
echo "Starting CloudWatch server with schema flattener..."
echo "Debug logging enabled: MCP_FLATTENER_DEBUG=1"
echo ""

export MCP_FLATTENER_DEBUG=1
export AWS_PROFILE="${AWS_PROFILE:-your-aws-profile}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export FASTMCP_LOG_LEVEL="ERROR"

# Run the flattener with timeout
timeout 30 python3 scripts/mcp-schema-flattener.py \
  uvx \
  --from awslabs.cloudwatch-mcp-server@latest \
  awslabs.cloudwatch-mcp-server 2>&1 | head -200

echo ""
echo "=== Test Complete ==="
