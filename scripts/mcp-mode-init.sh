#!/bin/bash

# MCP Mode Switcher - Automatically load correct MCP config based on active Roo Code mode
# This script is called during mode initialization to set up the appropriate MCP configuration

# Detect current mode from environment or argument
CURRENT_MODE="${1:-${ROO_MODE:-code}}"

# Map modes to MCP configs
case "$CURRENT_MODE" in
  git-ops|drupal-orchestrator|sre)
    # Git-heavy modes: Enable GitHub
    echo "🔧 Initializing MCP for $CURRENT_MODE mode (GitHub ENABLED)"
    cp .roo/mcp-git-ops.json .roo/mcp.json
    echo "✅ GitHub MCP server enabled"
    ;;
  
  code|architect|ask|debug|orchestrator|drupal-builder|drupal-architect|drupal-qa|documentation-writer|drupal-vision|test-engineer|config-manager|performance-engineer|ux-reviewer|compliance-reviewer|security-review|standards-reviewer|cloud-architect|knowledge-architect|devops-engineer)
    # All other modes: Disable GitHub
    echo "🔧 Initializing MCP for $CURRENT_MODE mode (GitHub DISABLED)"
    cp .roo/mcp-default.json .roo/mcp.json
    echo "✅ GitHub MCP server disabled (85% token savings)"
    ;;
  
  *)
    # Default: Disable GitHub
    echo "⚠️  Unknown mode '$CURRENT_MODE', using default config (GitHub DISABLED)"
    cp .roo/mcp-default.json .roo/mcp.json
    ;;
esac

# Verify config was applied
if [ -f .roo/mcp.json ]; then
  echo "📋 Current MCP config: $(head -1 .roo/mcp.json)"
else
  echo "❌ Error: .roo/mcp.json not found"
  exit 1
fi
