import axios from 'axios';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { embeddingDuration } from './metrics.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'nomic-embed-text:latest';
const NODE_ENV = process.env.NODE_ENV || 'local';

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
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const model = process.env.AWS_BEDROCK_MODEL || 'amazon.titan-embed-text-v2:0';
  
  try {
    const command = new InvokeModelCommand({
      modelId: model,
      body: JSON.stringify({ inputText: text })
    });
    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    
    // Normalize 1024-dim to 768-dim (truncate)
    return result.embedding.slice(0, 768);
  } catch (error) {
    console.error('Bedrock embedding failed:', error);
    throw new Error('Failed to generate embedding');
  } finally {
    timer();
  }
}

export function validateEmbedding(embedding: number[]): boolean {
  return embedding.length === 768 && embedding.every(v => typeof v === 'number');
}
