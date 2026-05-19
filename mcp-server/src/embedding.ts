import axios from 'axios';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { embeddingDuration } from './metrics';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'nomic-embed-text:latest';
const NODE_ENV = process.env.NODE_ENV || 'local';

// Environment-specific vector dimensions
const VECTOR_SIZE = NODE_ENV === 'production' ? 1024 : 768;

// Lazy-initialize Bedrock client only when needed (production mode)
let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return bedrockClient;
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (NODE_ENV === 'local') {
    return getOllamaEmbedding(text);
  } else {
    return getBedrockEmbedding(text);
  }
}

async function getOllamaEmbedding(text: string): Promise<number[]> {
  const timer = embeddingDuration.startTimer({ provider: 'ollama' });
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
      model: OLLAMA_MODEL,
      prompt: text
    });
    return response.data.embedding;
  } catch (error) {
    console.error('Ollama embedding failed:', error);
    throw new Error('Failed to generate embedding');
  } finally {
    timer();
  }
}

async function getBedrockEmbedding(text: string): Promise<number[]> {
  const timer = embeddingDuration.startTimer({ provider: 'bedrock' });
  const model = process.env.AWS_BEDROCK_MODEL || 'amazon.titan-embed-text-v2:0';
  
  try {
    const command = new InvokeModelCommand({
      modelId: model,
      body: JSON.stringify({
        inputText: text,
        dimensions: VECTOR_SIZE
      })
    });
    const response = await getBedrockClient().send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    
    // Return full embedding without truncation
    // Production uses 1024-dim (Bedrock native), local uses 768-dim (Ollama native)
    return result.embedding;
  } catch (error) {
    console.error('Bedrock embedding failed:', error);
    throw new Error('Failed to generate embedding');
  } finally {
    timer();
  }
}

export function validateEmbedding(embedding: number[]): boolean {
  // Accept both 768-dim (local) and 1024-dim (production)
  const validDimensions = [768, 1024];
  return validDimensions.includes(embedding.length) && embedding.every(v => typeof v === 'number');
}
