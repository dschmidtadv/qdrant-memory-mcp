import { Tool } from '@modelcontextprotocol/sdk/types';
import { getEmbedding } from './embedding';
import { upsertVectors, searchVectors } from './qdrant';
import { chunkText } from './chunking';
import { batchProcess } from './batching';
import { v4 as uuidv4 } from 'uuid';
import { toolCallsTotal, toolErrorsTotal, memorizeDuration, recallDuration, chunksStoredTotal, recallScoreAvg } from './metrics';

/**
 * Sanitize response text for MCP SDK compatibility.
 * Removes specific hidden or noncharacter Unicode code points and trims
 * surrounding whitespace; it does not validate or re-encode UTF-8.
 */
function sanitizeResponse(text: string): string {
  // Remove zero-width characters and other invisible Unicode
  return text
    .replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF]/g, '')
    .replace(/[\uFFF0-\uFFFD]/g, '')
    .trim();
}

/**
 * Truncate text to a maximum UTF-8 byte length without splitting Unicode code points
 */
function truncateUtf8ByBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return '';
  }

  let truncated = '';
  let currentBytes = 0;

  for (const char of text) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (currentBytes + charBytes > maxBytes) {
      break;
    }
    truncated += char;
    currentBytes += charBytes;
  }

  return truncated;
}

/**
 * Validate response size for MCP protocol compliance
 * MCP responses should be reasonably sized to avoid buffer issues
 * Reduced to 16KB to account for MCP stdio transport overhead
 */
function validateResponseSize(text: string, maxSize: number = 16384): string {
  const textSize = Buffer.byteLength(text, 'utf8');
  if (textSize > maxSize) {
    const truncationSuffix = '\n\n[Response truncated due to size limit]';
    const suffixSize = Buffer.byteLength(truncationSuffix, 'utf8');
    const availableBytes = Math.max(0, maxSize - suffixSize);

    console.error(`[recall_context] Response size ${textSize} exceeds limit ${maxSize}, truncating`);

    return truncateUtf8ByBytes(text, availableBytes) + truncationSuffix;
  }
  return text;
}

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
  const { query, project, limit: rawLimit = 5, tags } = input;
  const limit = Number(rawLimit);

  // Validate input before using values in metric labels/timers
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Query must be a non-empty string');
  }
  if (typeof project !== 'string' || project.trim().length === 0) {
    throw new Error('Project must be a non-empty string');
  }

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
        let content = payload.content || '';
        
        // Truncate content to 1000 chars per result to keep response size manageable
        if (content.length > 1000) {
          content = content.substring(0, 1000) + '\n\n[Content truncated...]';
        }
        
        markdown += `## Result (Score: ${score})\n`;
        markdown += `**Source:** ${source}\n`;
        markdown += `**Tags:** ${tagsArray.length > 0 ? tagsArray.join(', ') : 'none'}\n`;
        markdown += `**Timestamp:** ${timestamp}\n\n`;
        markdown += `${content}\n\n`;
        markdown += '---\n\n';
      }
    }
    
    // Sanitize response for MCP SDK compatibility
    let sanitized = sanitizeResponse(markdown);
    sanitized = validateResponseSize(sanitized);
    
    toolCallsTotal.inc({ tool: 'recall_context', project, status: 'success' });
    return sanitized;
  } catch (error) {
    toolErrorsTotal.inc({ tool: 'recall_context', error_type: error instanceof Error ? error.name : 'unknown' });
    toolCallsTotal.inc({ tool: 'recall_context', project, status: 'error' });
    throw error;
  } finally {
    timer();
  }
}

/**
 * Returns true for errors that are clearly transient and worth retrying:
 * network-level faults, timeouts, and HTTP 5xx server errors.
 * Validation/input errors and HTTP 4xx responses are non-transient and
 * should fail immediately without retrying.
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const msg = error.message.toLowerCase();

  // Network-level transient failure codes
  // Node.js errno codes (stored lowercase; the message string has already been .toLowerCase()'d above)
  const TRANSIENT_ERRNO_CODES = ['econnreset', 'econnrefused', 'etimedout', 'enotfound', 'enetunreach', 'epipe'];
  // Human-readable phrases that indicate transient network conditions
  const TRANSIENT_PHRASES = ['socket hang up', 'network error'];
  if ([...TRANSIENT_ERRNO_CODES, ...TRANSIENT_PHRASES].some(pattern => msg.includes(pattern))) {
    return true;
  }

  // Timeout signals
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return true;
  }

  // HTTP 5xx described in the message
  if (/\b5\d{2}\b/.test(msg)) {
    return true;
  }

  // HTTP status property (e.g. axios-style errors) — access via Record to avoid `any`
  const err = (error as unknown) as Record<string, unknown>;
  const response = err['response'] as Record<string, unknown> | undefined;
  let httpStatus: number | undefined;
  if (typeof response?.['status'] === 'number') {
    httpStatus = response['status'];
  } else if (typeof err['status'] === 'number') {
    httpStatus = err['status'];
  }
  if (httpStatus !== undefined && httpStatus >= 500) {
    return true;
  }

  // Everything else (validation errors, 4xx, unknown) — fail fast
  return false;
}

/**
 * Wrapper for handleRecallContext with retry logic
 * Retries up to 3 times with exponential backoff, but only for transient
 * errors (network faults, timeouts, 5xx). Validation and 4xx errors are
 * re-thrown immediately without retrying.
 */
export async function handleRecallContextWithRetry(input: any, retries = 3): Promise<string> {
  let lastError: Error | unknown = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        console.error(`[recall_context] Retry attempt ${attempt + 1}/${retries}`);
      }
      const result = await handleRecallContext(input);
      if (attempt > 0) {
        console.error(`[recall_context] ✓ Succeeded on attempt ${attempt + 1}`);
      }
      return result;
    } catch (error) {
      lastError = error;

      // Fail immediately for non-transient errors (validation, 4xx, etc.)
      if (!isTransientError(error)) {
        throw error;
      }

      if (attempt < retries - 1) {
        const backoffMs = 100 * Math.pow(2, attempt);
        console.error(
          `[recall_context] ✗ Attempt ${attempt + 1} failed (transient), retrying in ${backoffMs}ms:`,
          error instanceof Error ? error.message : String(error)
        );
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  console.error(`[recall_context] ✗ All ${retries} attempts failed`);
  throw lastError instanceof Error ? lastError : new Error('recall_context failed after all retries');
}
