#!/bin/bash
# Setup script to enable MCP Server auto-start on reboot

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$PROJECT_DIR/systemd/mcp-server.service"

echo "=== MCP Server Auto-Start Setup ==="
echo ""
echo "This script will enable the MCP Server to automatically start on system reboot."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ This script must be run as root (use sudo)"
  exit 1
fi

# Copy service file to systemd directory
echo "📋 Installing systemd service file..."
cp "$SERVICE_FILE" /etc/systemd/system/mcp-server.service

# Reload systemd daemon
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# Enable the service
echo "✅ Enabling MCP Server service..."
systemctl enable mcp-server.service

# Start the service
echo "🚀 Starting MCP Server service..."
systemctl start mcp-server.service

# Check status
echo ""
echo "=== Service Status ==="
systemctl status mcp-server.service

echo ""
echo "✅ Setup complete!"
echo ""
echo "The MCP Server will now:"
echo "  • Automatically start on system reboot"
echo "  • Auto-restart if it crashes"
echo "  • Start Docker services before starting the MCP Server"
echo ""
echo "Useful commands:"
echo "  • View logs: journalctl -u mcp-server -f"
echo "  • Stop service: sudo systemctl stop mcp-server"
echo "  • Restart service: sudo systemctl restart mcp-server"
echo "  • Disable auto-start: sudo systemctl disable mcp-server"
