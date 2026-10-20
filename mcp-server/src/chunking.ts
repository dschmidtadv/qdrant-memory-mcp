/**
 * Text chunking utilities for breaking down large documents
 * into manageable pieces for embedding and storage
 */

export interface Chunk {
  id: string;
  index: number;
  text: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Split text into chunks with overlap for better context preservation
 * @param text - The text to chunk
 * @param chunkSize - Target size of each chunk in characters
 * @param overlap - Number of characters to overlap between chunks
 * @returns Array of chunks with metadata
 */
export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): Chunk[] {
  if (!text || text.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const chunkText = text.substring(startIndex, endIndex);

    chunks.push({
      id: `chunk-${chunks.length}`,
      index: chunks.length,
      text: chunkText,
      startIndex,
      endIndex
    });

    // Move start index forward, accounting for overlap; clamp to 0
    startIndex = Math.max(endIndex - overlap, 0);

    // Prevent infinite loop if overlap is too large
    if (startIndex <= chunks[chunks.length - 1].startIndex) {
      startIndex = endIndex;
    }
  }

  return chunks;
}

/**
 * Split text by sentences for more semantic chunking
 * @param text - The text to chunk
 * @param maxChunkSize - Maximum characters per chunk
 * @returns Array of chunks
 */
export function chunkBySentences(
  text: string,
  maxChunkSize: number = 1000
): Chunk[] {
  // Simple sentence splitting (can be improved with NLP)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let startIndex = 0;

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
      const trimmedText = currentChunk.trim();
      chunks.push({
        id: `chunk-${chunks.length}`,
        index: chunks.length,
        text: trimmedText,
        startIndex,
        endIndex: startIndex + trimmedText.length
      });
      
      // Advance startIndex past the chunk we just pushed, then start new chunk with overlap (15%)
      startIndex += currentChunk.length;
      const overlapText = currentChunk.slice(-Math.floor(currentChunk.length * 0.15));
      currentChunk = overlapText + sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.length > 0) {
    const trimmedText = currentChunk.trim();
    chunks.push({
      id: `chunk-${chunks.length}`,
      index: chunks.length,
      text: trimmedText,
      startIndex,
      endIndex: startIndex + trimmedText.length
    });
  }

  return chunks;
}
