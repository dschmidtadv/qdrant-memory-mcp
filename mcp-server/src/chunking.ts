import { encodingForModel } from 'js-tiktoken';

const enc = encodingForModel('gpt-3.5-turbo');

export interface Chunk {
  text: string;
  tokens: number;
  index: number;
}

export function chunkText(text: string, targetTokens: number = 768): Chunk[] {
  // Split on semantic boundaries
  const paragraphs = text.split(/\n\n+/);
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const paragraph of paragraphs) {
    const tokens = enc.encode(currentChunk + paragraph).length;
    
    if (tokens > targetTokens && currentChunk) {
      // Save current chunk
      chunks.push({
        text: currentChunk.trim(),
        tokens: enc.encode(currentChunk).length,
        index: chunkIndex++
      });
      
      // Start new chunk with overlap (15%)
      const overlapText = currentChunk.slice(-Math.floor(currentChunk.length * 0.15));
      currentChunk = overlapText + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      tokens: enc.encode(currentChunk).length,
      index: chunkIndex
    });
  }
  
  return chunks;
}

export function validateChunks(chunks: Chunk[]): boolean {
  return chunks.every(chunk => {
    const tokens = chunk.tokens;
    return tokens >= 512 && tokens <= 1024;
  });
}
