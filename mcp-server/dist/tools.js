"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tools = void 0;
exports.handleMemorizeContext = handleMemorizeContext;
exports.handleRecallContext = handleRecallContext;
const embedding_1 = require("./embedding");
const qdrant_1 = require("./qdrant");
const chunking_1 = require("./chunking");
const uuid_1 = require("uuid");
const metrics_js_1 = require("./metrics.js");
exports.tools = [
    {
        name: 'memorize_context',
        description: 'Store important context, decisions, or code in the memory bank',
        inputSchema: {
            type: 'object',
            properties: {
                content: {
                    type: 'string',
                    description: 'Markdown content to store'
                },
                project: {
                    type: 'string',
                    description: 'Project name for filtering'
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorization'
                }
            },
            required: ['content', 'project']
        }
    },
    {
        name: 'recall_context',
        description: 'Retrieve relevant context from the memory bank',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Query text to search for'
                },
                project: {
                    type: 'string',
                    description: 'Project name to filter results'
                },
                limit: {
                    type: 'integer',
                    description: 'Number of results to return',
                    default: 5
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional tags to filter results'
                }
            },
            required: ['query', 'project']
        }
    }
];
async function handleMemorizeContext(input) {
    const { content, project, tags = [] } = input;
    const timer = metrics_js_1.memorizeDuration.startTimer({ project });
    try {
        metrics_js_1.toolCallsTotal.inc({ tool: 'memorize_context', project, status: 'started' });
        // Chunk content
        const chunks = (0, chunking_1.chunkText)(content);
        // Generate embeddings and prepare vectors
        const vectors = [];
        for (const chunk of chunks) {
            const embedding = await (0, embedding_1.getEmbedding)(chunk.text);
            vectors.push({
                id: (0, uuid_1.v4)(),
                vector: embedding,
                payload: {
                    project,
                    timestamp: Date.now(),
                    source: 'memorize_context',
                    tags,
                    chunk_index: chunk.index,
                    content: chunk.text
                }
            });
        }
        // Upsert to Qdrant
        const count = await (0, qdrant_1.upsertVectors)(vectors);
        // Record metrics
        metrics_js_1.chunksStoredTotal.inc({ project }, count);
        metrics_js_1.toolCallsTotal.inc({ tool: 'memorize_context', project, status: 'success' });
        return `Successfully stored ${count} chunks in memory for project "${project}"`;
    }
    catch (error) {
        metrics_js_1.toolErrorsTotal.inc({ tool: 'memorize_context', error_type: error instanceof Error ? error.name : 'unknown' });
        metrics_js_1.toolCallsTotal.inc({ tool: 'memorize_context', project, status: 'error' });
        throw error;
    }
    finally {
        timer();
    }
}
async function handleRecallContext(input) {
    const { query, project, limit = 5, tags } = input;
    const timer = metrics_js_1.recallDuration.startTimer({ project });
    try {
        metrics_js_1.toolCallsTotal.inc({ tool: 'recall_context', project, status: 'started' });
        // Generate embedding for query
        const queryEmbedding = await (0, embedding_1.getEmbedding)(query);
        // Search Qdrant
        const results = await (0, qdrant_1.searchVectors)(queryEmbedding, project, limit, tags);
        // Calculate average score for metrics
        const avgScore = results.length > 0
            ? results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length
            : 0;
        metrics_js_1.recallScoreAvg.set({ project }, avgScore);
        // Format results as markdown
        let markdown = `# Retrieved Context for "${query}"\n\n`;
        if (results.length === 0) {
            markdown += 'No results found.\n';
        }
        else {
            for (const result of results) {
                // Safely access payload fields with fallbacks
                const payload = result.payload || {};
                const score = result.score ? result.score.toFixed(3) : 'N/A';
                const source = payload.source || 'unknown';
                const tagsArray = Array.isArray(payload.tags) ? payload.tags : [];
                const timestamp = payload.timestamp ? new Date(payload.timestamp).toISOString() : 'unknown';
                const content = payload.content || '';
                markdown += `## Result (Score: ${score})\n`;
                markdown += `**Source:** ${source}\n`;
                markdown += `**Tags:** ${tagsArray.length > 0 ? tagsArray.join(', ') : 'none'}\n`;
                markdown += `**Timestamp:** ${timestamp}\n\n`;
                markdown += `${content}\n\n`;
                markdown += '---\n\n';
            }
        }
        metrics_js_1.toolCallsTotal.inc({ tool: 'recall_context', project, status: 'success' });
        return markdown;
    }
    catch (error) {
        metrics_js_1.toolErrorsTotal.inc({ tool: 'recall_context', error_type: error instanceof Error ? error.name : 'unknown' });
        metrics_js_1.toolCallsTotal.inc({ tool: 'recall_context', project, status: 'error' });
        throw error;
    }
    finally {
        timer();
    }
}
//# sourceMappingURL=tools.js.map