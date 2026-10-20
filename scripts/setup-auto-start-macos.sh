#!/bin/bash
# Setup script to enable MCP Server auto-start on macOS reboot using launchd

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_FILE="$PROJECT_DIR/launchd/com.qdrant.mcp-server.plist"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_PLIST="$LAUNCHD_DIR/com.qdrant.mcp-server.plist"

echo "=== MCP Server Auto-Start Setup (macOS) ==="
echo ""
echo "This script will enable the MCP Server to automatically start on system reboot."
echo ""

# Create LaunchAgents directory if it doesn't exist
if [ ! -d "$LAUNCHD_DIR" ]; then
  echo "📁 Creating LaunchAgents directory..."
  mkdir -p "$LAUNCHD_DIR"
fi

# Copy plist file to LaunchAgents
echo "📋 Installing launchd plist file..."
cp "$PLIST_FILE" "$LAUNCHD_PLIST"

# Load the plist
echo "🔄 Loading launchd service..."
launchctl load "$LAUNCHD_PLIST"

# Check if loaded
echo ""
echo "=== Service Status ==="
launchctl list | grep com.qdrant.mcp-server || echo "Service loaded but not yet running"

echo ""
echo "✅ Setup complete!"
echo ""
echo "The MCP Server will now:"
echo "  • Automatically start on system reboot"
echo "  • Auto-restart if it crashes"
echo "  • Start Docker services before starting the MCP Server"
echo ""
echo "Useful commands:"
echo "  • View logs: tail -f /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/logs/mcp-server.log"
echo "  • View errors: tail -f /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/logs/mcp-server-error.log"
echo "  • Stop service: launchctl unload ~/Library/LaunchAgents/com.qdrant.mcp-server.plist"
echo "  • Start service: launchctl load ~/Library/LaunchAgents/com.qdrant.mcp-server.plist"
echo "  • Check status: launchctl list | grep com.qdrant.mcp-server"
echo ""
echo "To disable auto-start:"
echo "  launchctl unload ~/Library/LaunchAgents/com.qdrant.mcp-server.plist"
echo "  rm ~/Library/LaunchAgents/com.qdrant.mcp-server.plist"
