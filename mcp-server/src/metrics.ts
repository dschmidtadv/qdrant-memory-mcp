// Prometheus metrics instrumentation for MCP server
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();

// Counters
export const toolCallsTotal = new Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total number of MCP tool calls',
  labelNames: ['tool', 'project', 'status'],
  registers: [registry],
});

export const toolErrorsTotal = new Counter({
  name: 'mcp_tool_errors_total',
  help: 'Total number of MCP tool errors',
  labelNames: ['tool', 'error_type'],
  registers: [registry],
});

export const chunksStoredTotal = new Counter({
  name: 'mcp_chunks_stored_total',
  help: 'Total number of chunks stored in Qdrant',
  labelNames: ['project'],
  registers: [registry],
});

// Histograms
export const recallDuration = new Histogram({
  name: 'mcp_recall_duration_seconds',
  help: 'Duration of recall_context operations',
  labelNames: ['project'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
  registers: [registry],
});

export const memorizeDuration = new Histogram({
  name: 'mcp_memorize_duration_seconds',
  help: 'Duration of memorize_context operations',
  labelNames: ['project'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
  registers: [registry],
});

export const embeddingDuration = new Histogram({
  name: 'mcp_embedding_duration_seconds',
  help: 'Duration of embedding generation',
  labelNames: ['provider'],  // 'ollama' | 'bedrock'
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
  registers: [registry],
});

// Gauges
export const recallScoreAvg = new Gauge({
  name: 'mcp_recall_score_avg',
  help: 'Average cosine similarity score of recall results',
  labelNames: ['project'],
  registers: [registry],
});

export const projectsActive = new Gauge({
  name: 'mcp_projects_active',
  help: 'Number of active projects in memory',
  registers: [registry],
});

export const vectorsStored = new Gauge({
  name: 'mcp_vectors_stored',
  help: 'Total number of vectors stored in Qdrant',
  registers: [registry],
});
