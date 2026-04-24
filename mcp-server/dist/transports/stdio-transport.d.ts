import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
/**
 * Setup stdio transport for local IDE integration
 * Used when TRANSPORT_MODE=stdio (default)
 * Reads from stdin and writes to stdout
 */
export declare function setupStdioTransport(server: Server): Promise<void>;
//# sourceMappingURL=stdio-transport.d.ts.map