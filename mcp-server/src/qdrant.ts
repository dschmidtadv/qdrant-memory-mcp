import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'agent-memory';

console.error(`Connecting to Qdrant at: ${QDRANT_URL}`);

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
      console.error(`Created collection: ${COLLECTION_NAME}`);
    } else {
      console.error(`Collection ${COLLECTION_NAME} already exists`);
    }
  } catch (error) {
    console.error('Failed to initialize Qdrant:', error);
    throw error;
  }
}

export interface Vector {
  id: string;
  vector: number[];
  payload: {
    project: string;
    timestamp: number;
    source: string;
    tags: string[];
    chunk_index: number;
    content: string;
  };
}

export async function upsertVectors(vectors: Vector[]): Promise<number> {
  try {
    await client.upsert(COLLECTION_NAME, {
      points: vectors.map(v => ({
        id: v.id,
        vector: v.vector,
        payload: v.payload
      }))
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
