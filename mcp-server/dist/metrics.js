"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vectorsStored = exports.projectsActive = exports.recallScoreAvg = exports.embeddingDuration = exports.memorizeDuration = exports.recallDuration = exports.chunksStoredTotal = exports.toolErrorsTotal = exports.toolCallsTotal = exports.registry = void 0;
// Prometheus metrics instrumentation for MCP server
const prom_client_1 = require("prom-client");
exports.registry = new prom_client_1.Registry();
// Counters
exports.toolCallsTotal = new prom_client_1.Counter({
    name: 'mcp_tool_calls_total',
    help: 'Total number of MCP tool calls',
    labelNames: ['tool', 'project', 'status'],
    registers: [exports.registry],
});
exports.toolErrorsTotal = new prom_client_1.Counter({
    name: 'mcp_tool_errors_total',
    help: 'Total number of MCP tool errors',
    labelNames: ['tool', 'error_type'],
    registers: [exports.registry],
});
exports.chunksStoredTotal = new prom_client_1.Counter({
    name: 'mcp_chunks_stored_total',
    help: 'Total number of chunks stored in Qdrant',
    labelNames: ['project'],
    registers: [exports.registry],
});
// Histograms
exports.recallDuration = new prom_client_1.Histogram({
    name: 'mcp_recall_duration_seconds',
    help: 'Duration of recall_context operations',
    labelNames: ['project'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
    registers: [exports.registry],
});
exports.memorizeDuration = new prom_client_1.Histogram({
    name: 'mcp_memorize_duration_seconds',
    help: 'Duration of memorize_context operations',
    labelNames: ['project'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    registers: [exports.registry],
});
exports.embeddingDuration = new prom_client_1.Histogram({
    name: 'mcp_embedding_duration_seconds',
    help: 'Duration of embedding generation',
    labelNames: ['provider'], // 'ollama' | 'bedrock'
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
    registers: [exports.registry],
});
// Gauges
exports.recallScoreAvg = new prom_client_1.Gauge({
    name: 'mcp_recall_score_avg',
    help: 'Average cosine similarity score of recall results',
    labelNames: ['project'],
    registers: [exports.registry],
});
exports.projectsActive = new prom_client_1.Gauge({
    name: 'mcp_projects_active',
    help: 'Number of active projects in memory',
    registers: [exports.registry],
});
exports.vectorsStored = new prom_client_1.Gauge({
    name: 'mcp_vectors_stored',
    help: 'Total number of vectors stored in Qdrant',
    registers: [exports.registry],
});
//# sourceMappingURL=metrics.js.map