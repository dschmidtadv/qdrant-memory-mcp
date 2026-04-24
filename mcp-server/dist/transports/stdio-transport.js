"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupStdioTransport = setupStdioTransport;
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
/**
 * Setup stdio transport for local IDE integration
 * Used when TRANSPORT_MODE=stdio (default)
 * Reads from stdin and writes to stdout
 */
async function setupStdioTransport(server) {
    try {
        const transport = new stdio_js_1.StdioServerTransport();
        await server.connect(transport);
        console.error('MCP Server connected via stdio transport (local IDE mode)');
    }
    catch (error) {
        console.error('Failed to setup stdio transport:', error);
        throw error;
    }
}
//# sourceMappingURL=stdio-transport.js.map