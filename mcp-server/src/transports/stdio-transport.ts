import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * Setup stdio transport for local IDE integration
 * Used when TRANSPORT_MODE=stdio (default)
 * Reads from stdin and writes to stdout
 */
export async function setupStdioTransport(server: Server): Promise<void> {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('MCP Server connected via stdio transport (local IDE mode)');
  } catch (error) {
    console.error('Failed to setup stdio transport:', error);
    throw error;
  }
}
