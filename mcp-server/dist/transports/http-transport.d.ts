import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';
/**
 * Setup HTTP transport for cloud Fargate deployment
 * Used when TRANSPORT_MODE=http
 * Exposes /mcp endpoint for ALB routing
 *
 * Note: This implementation uses a custom HTTP wrapper since
 * StreamableHTTPServerTransport may not be available in SDK v1.0.0
 */
export declare function setupHttpTransport(app: express.Express, server: Server): Promise<void>;
//# sourceMappingURL=http-transport.d.ts.map