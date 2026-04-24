import { Tool } from '@modelcontextprotocol/sdk/types';
import { getEmbedding } from './embedding';
import { upsertVectors, searchVectors } from './qdrant';
import { chunkText } from './chunking';
import { batchProcess } from './batching';
import { v4 as uuidv4 } from 'uuid';
import { toolCallsTotal, toolErrorsTotal, memorizeDuration, recallDuration, chunksStoredTotal, recallScoreAvg } from './metrics.js';

export const tools: Tool[] = [
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

export async function handleMemorizeContext(input: any): Promise<string> {
  const { content, project, tags = [] } = input;
  const timer = memorizeDuration.startTimer({ project });
  
  try {
    toolCallsTotal.inc({ tool: 'memorize_context', project, status: 'started' });
    
    // Chunk content
    const chunks = chunkText(content);
    
    // Generate embeddings in parallel batches (batch size: 5 for Bedrock rate limit protection)
    const embeddings = await batchProcess(
      chunks,
      chunk => getEmbedding(chunk.text),
      5 // Batch size
    );
    
    // Prepare vectors with embeddings
    const vectors = chunks.map((chunk, index) => ({
      id: uuidv4(),
      vector: embeddings[index],
      payload: {
        project,
        timestamp: Date.now(),
        source: 'memorize_context',
        tags,
        chunk_index: chunk.index,
        content: chunk.text
      }
    }));
    
    // Upsert to Qdrant
    const count = await upsertVectors(vectors);
    
    // Record metrics
    chunksStoredTotal.inc({ project }, count);
    toolCallsTotal.inc({ tool: 'memorize_context', project, status: 'success' });
    
    return `Successfully stored ${count} chunks in memory for project "${project}"`;
  } catch (error) {
    toolErrorsTotal.inc({ tool: 'memorize_context', error_type: error instanceof Error ? error.name : 'unknown' });
    toolCallsTotal.inc({ tool: 'memorize_context', project, status: 'error' });
    throw error;
  } finally {
    timer();
  }
}

export async function handleRecallContext(input: any): Promise<string> {
  const { query, project, limit = 5, tags } = input;
  const timer = recallDuration.startTimer({ project });
  
  try {
    toolCallsTotal.inc({ tool: 'recall_context', project, status: 'started' });
    
    // Generate embedding for query
    const queryEmbedding = await getEmbedding(query);
    
    // Search Qdrant
    const results = await searchVectors(queryEmbedding, project, limit, tags);
    
    // Calculate average score for metrics
    const avgScore = results.length > 0
      ? results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length
      : 0;
    recallScoreAvg.set({ project }, avgScore);
    
    // Format results as markdown
    let markdown = `# Retrieved Context for "${query}"\n\n`;
    
    if (results.length === 0) {
      markdown += 'No results found.\n';
    } else {
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
    
    toolCallsTotal.inc({ tool: 'recall_context', project, status: 'success' });
    return markdown;
  } catch (error) {
    toolErrorsTotal.inc({ tool: 'recall_context', error_type: error instanceof Error ? error.name : 'unknown' });
    toolCallsTotal.inc({ tool: 'recall_context', project, status: 'error' });
    throw error;
  } finally {
    timer();
  }
}
