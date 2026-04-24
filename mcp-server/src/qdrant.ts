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
      // Create collection
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 768,
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
    
    const response: any = await client.search(COLLECTION_NAME, {
      vector: query,
      limit,
      filter,
      with_payload: true
    });
    
    // Ensure we return an array of results
    const results = Array.isArray(response) ? response : (response?.result || response?.results || []);
    
    return results.map((item: any) => ({
      score: item.score || 0,
      payload: item.payload || {}
    }));
  } catch (error) {
    console.error('Failed to search vectors:', error);
    throw error;
  }
}

export { COLLECTION_NAME, VECTOR_SIZE };
