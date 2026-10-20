#!/bin/bash

# MCP Proxy Configuration Optimization Script
# Implements immediate recommendations to fix timeout issues

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     MCP Proxy Configuration Optimization                      ║"
echo "║     Implementing Immediate Recommendations                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration file path
MCP_SETTINGS="$HOME/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json"

# Backup original
BACKUP_FILE="${MCP_SETTINGS}.backup.$(date +%s)"
echo "Creating backup: $BACKUP_FILE"
cp "$MCP_SETTINGS" "$BACKUP_FILE"
echo "✓ Backup created"
echo ""

# Create optimized configuration
echo "Applying optimizations..."
echo ""

# Use Node.js to modify JSON safely
node << 'EOF'
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(
  process.env.HOME,
  'Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'
);

// Read current settings
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

// Optimization 1: Add timeout to mcp-proxy
console.log('✓ Optimization 1: Adding timeout configuration');
settings.mcpServers['mcp-proxy'].timeout = 120000;
settings.mcpServers['mcp-proxy'].env.MCP_PROXY_TIMEOUT = '120000';
settings.mcpServers['mcp-proxy'].env.MCP_PROXY_DISCOVERY_TIMEOUT = '120000';
console.log('  - MCP_PROXY_TIMEOUT: 120000ms');
console.log('  - MCP_PROXY_DISCOVERY_TIMEOUT: 120000ms');
console.log('');

// Optimization 2: Remove schema flattening from AWS servers
console.log('✓ Optimization 2: Removing schema flattening wrapper');

const upstreamsStr = settings.mcpServers['mcp-proxy'].env.MCP_PROXY_UPSTREAMS;
let upstreams = JSON.parse(upstreamsStr);

// Process each upstream
upstreams = upstreams.map(upstream => {
  if (upstream.name === 'aws-cloudwatch') {
    console.log('  - aws-cloudwatch: Removed schema flattener');
    return {
      name: 'aws-cloudwatch',
      command: 'uvx',
      args: [
        '--from', 'awslabs.cloudwatch-mcp-server@latest',
        'awslabs.cloudwatch-mcp-server'
      ],
      env: {
        AWS_PROFILE: process.env.AWS_PROFILE || 'your-aws-profile',
        AWS_REGION: 'us-east-1',
        FASTMCP_LOG_LEVEL: 'ERROR'
      }
    };
  }
  if (upstream.name === 'aws-documentation') {
    console.log('  - aws-documentation: Removed schema flattener');
    return {
      name: 'aws-documentation',
      command: 'uvx',
      args: [
        '--from', 'awslabs.aws-documentation-mcp-server@latest',
        'awslabs.aws-documentation-mcp-server'
      ],
      env: {
        AWS_PROFILE: process.env.AWS_PROFILE || 'your-aws-profile',
        AWS_REGION: 'us-east-1',
        FASTMCP_LOG_LEVEL: 'ERROR'
      }
    };
  }
  if (upstream.name === 'aws-iam') {
    console.log('  - aws-iam: Removed schema flattener');
    return {
      name: 'aws-iam',
      command: 'uvx',
      args: [
        '--from', 'awslabs.iam-mcp-server@latest',
        'awslabs.iam-mcp-server'
      ],
      env: {
        AWS_PROFILE: process.env.AWS_PROFILE || 'your-aws-profile',
        AWS_REGION: 'us-east-1',
        FASTMCP_LOG_LEVEL: 'ERROR'
      }
    };
  }
  return upstream;
});

settings.mcpServers['mcp-proxy'].env.MCP_PROXY_UPSTREAMS = JSON.stringify(upstreams);
console.log('');

// Optimization 3: Add environment variables for better error handling
console.log('✓ Optimization 3: Adding environment variables');
settings.mcpServers['mcp-proxy'].env.NODE_OPTIONS = '--max-http-header-size=16384';
settings.mcpServers['mcp-proxy'].env.MCP_PROXY_LOG_LEVEL = 'info';
console.log('  - NODE_OPTIONS: --max-http-header-size=16384');
console.log('  - MCP_PROXY_LOG_LEVEL: info');
console.log('');

// Write optimized settings
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
console.log('✓ Configuration saved');
EOF

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    OPTIMIZATIONS APPLIED                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "Changes made:"
echo "  1. ✓ Increased MCP Proxy timeout to 120 seconds"
echo "  2. ✓ Removed schema flattening from AWS servers"
echo "  3. ✓ Added environment variables for better handling"
echo ""

echo "Next steps:"
echo "  1. Restart Claude Desktop completely"
echo "  2. Wait 5 seconds"
echo "  3. Reopen Claude Desktop"
echo "  4. Run: node scripts/mcp-dashboard.js"
echo "  5. Monitor tool registration"
echo ""

echo "To rollback changes:"
echo "  cp $BACKUP_FILE \"$MCP_SETTINGS\""
echo ""

echo "✓ Configuration optimization complete"
