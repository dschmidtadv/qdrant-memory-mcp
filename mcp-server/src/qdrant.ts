import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

// Environment-aware collection configuration
const COLLECTION_NAME = process.env.NODE_ENV === 'production' 
  ? 'agent-memory-prod' 
  : 'agent-memory';

const VECTOR_SIZE = process.env.NODE_ENV === 'production' ? 1024 : 768;

console.error(`Connecting to Qdrant at: ${QDRANT_URL}`);
console.error(`Environment: ${process.env.NODE_ENV || 'local'}`);
console.error(`Collection: ${COLLECTION_NAME} (${VECTOR_SIZE}-dim)`);

const client = new QdrantClient({ url: QDRANT_URL });

export async function initializeQdrant(): Promise<void> {
  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
    
    if (!exists) {
      // Create collection with environment-specific vector size
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine'
        },
        hnsw_config: {
          m: 16,
          ef_construct: 200
        }
      });
      console.error(`Created collection: ${COLLECTION_NAME} (${VECTOR_SIZE}-dim)`);
    } else {
      console.error(`Collection ${COLLECTION_NAME} already exists`);
    }
  } catch (error) {
    console.error('Failed to initialize Qdrant:', error);
    throw error;
  }
}

export async function upsertVectors(vectors: any[]): Promise<number> {
  try {
    await client.upsert(COLLECTION_NAME, {
      points: vectors
    });
    return vectors.length;
  } catch (error) {
    console.error('Failed to upsert vectors:', error);
    throw error;
  }
}

export async function searchVectors(
  query: number[],
  project: string,
  limit: number = 5,
  tags?: string[]
): Promise<any[]> {
  try {
    const filter: any = {
      must: [
        {
          key: 'project',
          match: { value: project }
        }
      ]
    };
    
    if (tags && tags.length > 0) {
      filter.must.push({
        key: 'tags',
        match: { any: tags }
      });
    }
    
    console.error(`[searchVectors] Searching collection: ${COLLECTION_NAME}, project: ${project}, limit: ${limit}, tags: ${tags?.join(',') || 'none'}`);
    
    const response: any = await client.search(COLLECTION_NAME, {
      vector: query,
      limit,
      filter,
      with_payload: true
    });
    
    // Log the actual response structure for debugging
    console.error(`[searchVectors] Raw response type: ${typeof response}, isArray: ${Array.isArray(response)}`);
    console.error(`[searchVectors] Response keys: ${Object.keys(response || {}).join(', ')}`);
    
    // The Qdrant JS client returns the search results directly as an array
    // when using client.search(), not wrapped in a response object
    let results: any[] = [];
    
    if (Array.isArray(response)) {
      // Direct array response from client.search() - this is the normal case
      results = response;
      console.error(`[searchVectors] ✓ Parsed as direct array with ${results.length} results`);
    } else if (response && typeof response === 'object') {
      // Try common response wrapper patterns (fallback for different API versions)
      if (Array.isArray(response.points)) {
        results = response.points;
        console.error(`[searchVectors] ✓ Parsed from response.points with ${results.length} results`);
      } else if (Array.isArray(response.result)) {
        results = response.result;
        console.error(`[searchVectors] ✓ Parsed from response.result with ${results.length} results`);
      } else if (Array.isArray(response.results)) {
        results = response.results;
        console.error(`[searchVectors] ✓ Parsed from response.results with ${results.length} results`);
      } else {
        console.error(`[searchVectors] ✗ Response is object but no array found in standard properties`);
        console.error(`[searchVectors] Response structure:`, JSON.stringify(response, null, 2).substring(0, 500));
        results = [];
      }
    } else {
      console.error(`[searchVectors] ✗ Unexpected response type: ${typeof response}`);
      results = [];
    }
    
    const transformed = results.map((item: any) => ({
      score: item.score || 0,
      payload: item.payload || {}
    }));
    
    console.error(`[searchVectors] ✓ Returning ${transformed.length} transformed results`);
    return transformed;
  } catch (error) {
    console.error('Failed to search vectors:', error);
    if (error instanceof Error) {
      console.error(`[searchVectors] Error message: ${error.message}`);
      console.error(`[searchVectors] Error stack: ${error.stack}`);
    }
    throw error;
  }
}

export { COLLECTION_NAME, VECTOR_SIZE };
