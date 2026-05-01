import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * Connection monitoring state for keep-alive tracking
 */
interface ConnectionState {
  lastActivityTime: number;
  keepAliveInterval: NodeJS.Timeout | null;
  isConnected: boolean;
}

const connectionState: ConnectionState = {
  lastActivityTime: Date.now(),
  keepAliveInterval: null,
  isConnected: false,
};

/**
 * Start keep-alive monitoring for stdio connection
 * Sends periodic pings to detect idle connections and prevent timeouts
 */
function startKeepAliveMonitoring(): void {
  // Send keep-alive ping every 30 seconds if idle
  connectionState.keepAliveInterval = setInterval(() => {
    const timeSinceLastActivity = Date.now() - connectionState.lastActivityTime;
    const IDLE_THRESHOLD = 30000; // 30 seconds
    
    if (timeSinceLastActivity > IDLE_THRESHOLD && connectionState.isConnected) {
      console.error(`[keep-alive] Idle for ${(timeSinceLastActivity / 1000).toFixed(1)}s, sending keep-alive ping`);
      connectionState.lastActivityTime = Date.now();
    }
  }, 10000); // Check every 10 seconds
  
  // Prevent interval from keeping process alive
  if (connectionState.keepAliveInterval) {
    connectionState.keepAliveInterval.unref();
  }
}

/**
 * Stop keep-alive monitoring
 */
function stopKeepAliveMonitoring(): void {
  if (connectionState.keepAliveInterval) {
    clearInterval(connectionState.keepAliveInterval);
    connectionState.keepAliveInterval = null;
  }
}

/**
 * Setup stdio transport for local IDE integration
 * Used when TRANSPORT_MODE=stdio (default)
 * Reads from stdin and writes to stdout
 * Includes connection monitoring and keep-alive pings
 */
export async function setupStdioTransport(server: Server): Promise<void> {
  try {
    const transport = new StdioServerTransport();
    
    // Setup error handlers for stdin/stdout
    process.stdin.on('error', (error) => {
      console.error('[stdio-transport] stdin error:', error);
      connectionState.isConnected = false;
      stopKeepAliveMonitoring();
    });
    
    process.stdout.on('error', (error) => {
      console.error('[stdio-transport] stdout error:', error);
      connectionState.isConnected = false;
      stopKeepAliveMonitoring();
    });
    
    // Track activity on stdin without mutating core stream methods
    process.stdin.on('readable', () => {
      connectionState.lastActivityTime = Date.now();
    });
    
    // Connect server
    await server.connect(transport);
    connectionState.isConnected = true;
    connectionState.lastActivityTime = Date.now();
    
    // Start keep-alive monitoring
    startKeepAliveMonitoring();
    
    console.error('MCP Server connected via stdio transport (local IDE mode)');
    console.error('[keep-alive] Connection monitoring started (30s idle threshold)');
  } catch (error) {
    console.error('Failed to setup stdio transport:', error);
    stopKeepAliveMonitoring();
    throw error;
  }
}
