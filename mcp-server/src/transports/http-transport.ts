import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/http.js';
import express from 'express';

/**
 * Setup HTTP transport for cloud Fargate deployment
 * Used when TRANSPORT_MODE=http
 * Exposes /mcp endpoint for ALB routing
 */
export async function setupHttpTransport(
  app: express.Express,
  server: Server
): Promise<void> {
  try {
    const transport = new StreamableHTTPServerTransport('/mcp', app);
    await server.connect(transport);
    console.error('MCP Server connected via HTTP transport on /mcp (cloud mode)');
  } catch (error) {
    console.error('Failed to setup HTTP transport:', error);
    throw error;
  }
}
