"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const qdrant_js_1 = require("./qdrant.js");
const tools_js_1 = require("./tools.js");
const metrics_js_1 = require("./metrics.js");
const stdio_transport_js_1 = require("./transports/stdio-transport.js");
const http_transport_js_1 = require("./transports/http-transport.js");
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Initialize server with tools capability
const server = new index_js_1.Server({
    name: 'qdrant-memory-mcp',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// Register tools
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return { tools: tools_js_1.tools };
});
// Handle tool calls
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const toolArgs = request.params.arguments || {};
    try {
        if (toolName === 'memorize_context') {
            const result = await (0, tools_js_1.handleMemorizeContext)(toolArgs);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
        else if (toolName === 'recall_context') {
            const result = await (0, tools_js_1.handleRecallContext)(toolArgs);
            return {
                content: [
                    {
                        type: 'text',
                        text: result,
                    },
                ],
            };
        }
        else {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Unknown tool: ${toolName}`,
                    },
                ],
                isError: true,
            };
        }
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
// Start metrics HTTP server
function startMetricsServer() {
    const metricsApp = (0, express_1.default)();
    metricsApp.get('/metrics', async (req, res) => {
        res.set('Content-Type', metrics_js_1.registry.contentType);
        res.end(await metrics_js_1.registry.metrics());
    });
    const metricsServer = metricsApp.listen(9091, () => {
        console.error('Metrics server listening on :9091');
    });
    return { app: metricsApp, metricsServer };
}
// Start server
async function main() {
    try {
        await (0, qdrant_js_1.initializeQdrant)();
        console.error('Qdrant initialized successfully');
        // Start metrics server
        const { app: metricsApp } = startMetricsServer();
        // Select transport based on environment variable
        const rawTransportMode = (process.env.TRANSPORT_MODE ?? 'stdio').toLowerCase();
        if (rawTransportMode !== 'stdio' && rawTransportMode !== 'http') {
            throw new Error(`Unsupported TRANSPORT_MODE: "${process.env.TRANSPORT_MODE}". Must be "stdio" or "http".`);
        }
        const transportMode = rawTransportMode;
        console.error(`Transport mode: ${transportMode}`);
        if (transportMode === 'http') {
            // Cloud deployment: HTTP transport
            await (0, http_transport_js_1.setupHttpTransport)(metricsApp, server);
        }
        else {
            // Local IDE: stdio transport (default)
            await (0, stdio_transport_js_1.setupStdioTransport)(server);
        }
    }
    catch (error) {
        console.error('Failed to start MCP Server:', error);
        process.exit(1);
    }
}
main().catch(console.error);
//# sourceMappingURL=index.js.map