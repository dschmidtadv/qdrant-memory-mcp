#!/usr/bin/env node

/**
 * MCP Tool Registration Monitor Dashboard
 * 
 * Monitors MCP server tool registration in real-time
 * Displays:
 * - Active MCP servers
 * - Registered tools per server
 * - Tool registration events
 * - Debug logging output
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LOG_FILE = '/tmp/mcp-debug.log';
const TOOL_REG_LOG = '/tmp/mcp-tool-registration.log';

class MCPDashboard {
  constructor() {
    this.servers = new Map();
    this.tools = new Map();
    this.events = [];
    this.maxEvents = 100;
  }

  /**
   * Initialize dashboard and start monitoring
   */
  start() {
    console.clear();
    this.printHeader();
    this.setupLogWatchers();
    this.startRefreshInterval();
    this.printInstructions();
  }

  /**
   * Print dashboard header
   */
  printHeader() {
    console.log('\x1b[36m%s\x1b[0m', '╔════════════════════════════════════════════════════════════════╗');
    console.log('\x1b[36m%s\x1b[0m', '║         MCP Tool Registration Monitor Dashboard                  ║');
    console.log('\x1b[36m%s\x1b[0m', '║                  Debug Logging: ENABLED                           ║');
    console.log('\x1b[36m%s\x1b[0m', '╚════════════════════════════════════════════════════════════════╝');
    console.log('');
  }

  /**
   * Print usage instructions
   */
  printInstructions() {
    console.log('\x1b[33m%s\x1b[0m', 'Environment Variables Active:');
    console.log('  • MCP_FLATTENER_DEBUG=1');
    console.log('  • DEBUG=mcp:*');
    console.log('  • NODE_DEBUG=mcp,http');
    console.log('  • LOG_LEVEL=debug');
    console.log('');
    console.log('\x1b[33m%s\x1b[0m', 'Log Files:');
    console.log(`  • Debug Log: ${LOG_FILE}`);
    console.log(`  • Tool Registration: ${TOOL_REG_LOG}`);
    console.log('');
  }

  /**
   * Setup file watchers for log files
   */
  setupLogWatchers() {
    // Watch debug log
    if (fs.existsSync(LOG_FILE)) {
      fs.watchFile(LOG_FILE, (curr, prev) => {
        this.parseDebugLog();
      });
    }

    // Watch tool registration log
    if (fs.existsSync(TOOL_REG_LOG)) {
      fs.watchFile(TOOL_REG_LOG, (curr, prev) => {
        this.parseToolRegistrationLog();
      });
    }
  }

  /**
   * Parse debug log for MCP events
   */
  parseDebugLog() {
    try {
      if (!fs.existsSync(LOG_FILE)) return;
      
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.split('\n').slice(-50); // Last 50 lines
      
      lines.forEach(line => {
        if (line.includes('mcp:') || line.includes('tool') || line.includes('register')) {
          this.addEvent('DEBUG', line);
        }
      });
    } catch (err) {
      // Silently ignore read errors
    }
  }

  /**
   * Parse tool registration log
   */
  parseToolRegistrationLog() {
    try {
      if (!fs.existsSync(TOOL_REG_LOG)) return;
      
      const content = fs.readFileSync(TOOL_REG_LOG, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach(line => {
        if (line.trim()) {
          try {
            const entry = JSON.parse(line);
            if (entry.server && entry.tools) {
              this.servers.set(entry.server, {
                toolCount: entry.tools.length,
                tools: entry.tools,
                timestamp: entry.timestamp || new Date().toISOString()
              });
              this.addEvent('REGISTRATION', `${entry.server}: ${entry.tools.length} tools registered`);
            }
          } catch (e) {
            // Not JSON, skip
          }
        }
      });
    } catch (err) {
      // Silently ignore read errors
    }
  }

  /**
   * Add event to event log
   */
  addEvent(type, message) {
    this.events.push({
      type,
      message,
      timestamp: new Date().toLocaleTimeString()
    });
    
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  /**
   * Refresh dashboard display
   */
  refresh() {
    console.clear();
    this.printHeader();
    this.printInstructions();
    this.printServersStatus();
    this.printRecentEvents();
  }

  /**
   * Print server status
   */
  printServersStatus() {
    console.log('\x1b[32m%s\x1b[0m', '═══ MCP SERVERS STATUS ═══');
    
    if (this.servers.size === 0) {
      console.log('\x1b[90m%s\x1b[0m', '  (Waiting for tool registration events...)');
    } else {
      this.servers.forEach((info, server) => {
        const status = '\x1b[32m✓\x1b[0m';
        console.log(`  ${status} ${server}`);
        console.log(`     Tools: ${info.toolCount}`);
        console.log(`     Updated: ${info.timestamp}`);
        
        if (info.tools && info.tools.length > 0) {
          const toolList = info.tools.slice(0, 5).join(', ');
          const more = info.tools.length > 5 ? ` +${info.tools.length - 5} more` : '';
          console.log(`     Sample: ${toolList}${more}`);
        }
        console.log('');
      });
    }
  }

  /**
   * Print recent events
   */
  printRecentEvents() {
    console.log('\x1b[32m%s\x1b[0m', '═══ RECENT EVENTS ═══');
    
    if (this.events.length === 0) {
      console.log('\x1b[90m%s\x1b[0m', '  (No events yet)');
    } else {
      const recentEvents = this.events.slice(-20);
      recentEvents.forEach(event => {
        const typeColor = event.type === 'REGISTRATION' ? '\x1b[33m' : '\x1b[36m';
        console.log(`  ${typeColor}[${event.type}]\x1b[0m ${event.timestamp}`);
        console.log(`    ${event.message}`);
      });
    }
    
    console.log('');
    console.log('\x1b[90m%s\x1b[0m', 'Press Ctrl+C to exit');
  }

  /**
   * Start refresh interval
   */
  startRefreshInterval() {
    setInterval(() => {
      this.refresh();
    }, 2000); // Refresh every 2 seconds
  }
}

// Start dashboard
const dashboard = new MCPDashboard();
dashboard.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nDashboard stopped.');
  process.exit(0);
});
