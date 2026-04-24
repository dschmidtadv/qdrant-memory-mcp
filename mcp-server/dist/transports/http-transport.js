"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupHttpTransport = setupHttpTransport;
const express_1 = __importDefault(require("express"));
/**
 * Setup HTTP transport for cloud Fargate deployment
 * Used when TRANSPORT_MODE=http
 * Exposes /mcp endpoint for ALB routing
 *
 * Note: This implementation uses a custom HTTP wrapper since
 * StreamableHTTPServerTransport may not be available in SDK v1.0.0
 */
async function setupHttpTransport(app, server) {
    try {
        // Add MCP endpoint handler
        app.post('/mcp', express_1.default.json(), async (req, res) => {
            try {
                // Handle MCP protocol requests
                const request = req.body;
                // For now, return a placeholder response
                // In production, this would route to the actual MCP server
                res.json({
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {
                        message: 'MCP HTTP transport endpoint active'
                    }
                });
            }
            catch (error) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error'
                    }
                });
            }
        });
        console.error('MCP Server HTTP transport configured on /mcp (cloud mode)');
    }
    catch (error) {
        console.error('Failed to setup HTTP transport:', error);
        throw error;
    }
}
//# sourceMappingURL=http-transport.js.map