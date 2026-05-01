import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initializeQdrant } from './qdrant';
import { tools, handleMemorizeContext, handleRecallContextWithRetry } from './tools';
import { registry } from './metrics';
import { setupStdioTransport } from './transports/stdio-transport';
import { setupHttpTransport } from './transports/http-transport';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

// Initialize server with tools capability
const server = new Server(
  {
    name: 'qdrant-memory-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const toolName = request.params.name;
  const toolArgs = request.params.arguments || {};

  try {
    if (toolName === 'memorize_context') {
      const result = await handleMemorizeContext(toolArgs);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } else if (toolName === 'recall_context') {
      const result = await handleRecallContextWithRetry(toolArgs);
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } else {
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
  } catch (error) {
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
  const metricsApp = express();
  metricsApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });
  const metricsServer = metricsApp.listen(9091, () => {
    console.error('Metrics server listening on :9091');
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error('Port 9091 already in use, metrics server skipped');
    } else {
      console.error('Metrics server error:', err);
    }
  });
  return { app: metricsApp, metricsServer };
}

// Start server
async function main() {
  try {
    await initializeQdrant();
    console.error('Qdrant initialized successfully');

    // Start metrics server
    const { app: metricsApp } = startMetricsServer();

    // Select transport based on environment variable
    const rawTransportMode = (process.env.TRANSPORT_MODE ?? 'stdio').toLowerCase();
    if (rawTransportMode !== 'stdio' && rawTransportMode !== 'http') {
      throw new Error(
        `Unsupported TRANSPORT_MODE: "${process.env.TRANSPORT_MODE}". Must be "stdio" or "http".`
      );
    }
    const transportMode = rawTransportMode as 'stdio' | 'http';
    console.error(`Transport mode: ${transportMode}`);

    if (transportMode === 'http') {
      // Cloud deployment: HTTP transport
      await setupHttpTransport(metricsApp, server);
    } else {
      // Local IDE: stdio transport (default)
      await setupStdioTransport(server);
    }
  } catch (error) {
    console.error('Failed to start MCP Server:', error);
    process.exit(1);
  }
}

main().catch(console.error);
