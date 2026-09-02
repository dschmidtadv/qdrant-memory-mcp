#!/bin/bash

# MCP Debug Logging Enablement Script
# Enables MCP_FLATTENER_DEBUG=1 and starts monitoring dashboard

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         MCP Debug Logging Enablement Script                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
MCP_SETTINGS_FILE="$HOME/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json"
DEBUG_LOG="/tmp/mcp-debug.log"
TOOL_REG_LOG="/tmp/mcp-tool-registration.log"

echo -e "${BLUE}Step 1: Verifying MCP settings file${NC}"
if [ ! -f "$MCP_SETTINGS_FILE" ]; then
    echo -e "${RED}✗ MCP settings file not found: $MCP_SETTINGS_FILE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ MCP settings file found${NC}"
echo ""

echo -e "${BLUE}Step 2: Setting up debug environment variables${NC}"
export MCP_FLATTENER_DEBUG=1
export DEBUG=mcp:*
export NODE_DEBUG=mcp,http
export LOG_LEVEL=debug
echo -e "${GREEN}✓ Environment variables set:${NC}"
echo "  • MCP_FLATTENER_DEBUG=1"
echo "  • DEBUG=mcp:*"
echo "  • NODE_DEBUG=mcp,http"
echo "  • LOG_LEVEL=debug"
echo ""

echo -e "${BLUE}Step 3: Initializing log files${NC}"
touch "$DEBUG_LOG"
touch "$TOOL_REG_LOG"
echo -e "${GREEN}✓ Log files initialized:${NC}"
echo "  • $DEBUG_LOG"
echo "  • $TOOL_REG_LOG"
echo ""

echo -e "${BLUE}Step 4: Configuration Summary${NC}"
cat << EOF
${GREEN}Debug Logging Configuration:${NC}
  Environment: MCP_FLATTENER_DEBUG=1
  Debug Namespace: mcp:*
  Node Debug: mcp,http
  Log Level: debug

${GREEN}Monitoring Endpoints:${NC}
  Dashboard Port: 9090
  Metrics Port: 9091
  
${GREEN}Log Files:${NC}
  Debug Log: $DEBUG_LOG
  Tool Registration: $TOOL_REG_LOG

${YELLOW}Next Steps:${NC}
  1. Restart Claude Desktop to apply debug logging
  2. Run: node scripts/mcp-dashboard.js
  3. Monitor tool registration in real-time

${YELLOW}To Disable Debug Logging:${NC}
  unset MCP_FLATTENER_DEBUG
  unset DEBUG
  unset NODE_DEBUG
  unset LOG_LEVEL
EOF
echo ""

echo -e "${BLUE}Step 5: Starting MCP Dashboard${NC}"
echo -e "${YELLOW}Launching monitoring dashboard...${NC}"
echo ""

# Check if dashboard script exists
if [ ! -f "scripts/mcp-dashboard.js" ]; then
    echo -e "${RED}✗ Dashboard script not found: scripts/mcp-dashboard.js${NC}"
    echo -e "${YELLOW}Please run from project root directory${NC}"
    exit 1
fi

# Start dashboard
node scripts/mcp-dashboard.js
