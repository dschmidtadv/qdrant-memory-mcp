import axios from 'axios';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

// Environment-aware collection configuration
const COLLECTION_NAME = process.env.NODE_ENV === 'production'
  ? 'agent-memory-prod'
  : 'agent-memory';

const VECTOR_SIZE = process.env.NODE_ENV === 'production' ? 1024 : 768;

console.error(`Connecting to Qdrant at: ${QDRANT_URL}`);
console.error(`Environment: ${process.env.NODE_ENV || 'local'}`);
console.error(`Collection: ${COLLECTION_NAME} (${VECTOR_SIZE}-dim)`);

// Use axios directly to avoid QdrantClient HTTP agent issues
const axiosClient = axios.create({
  baseURL: QDRANT_URL,
  timeout: 30000,
  validateStatus: () => true  // Don't throw on any status code
});

export async function initializeQdrant(): Promise<void> {
  try {
    console.error('[initializeQdrant] Starting initialization...');
    
    // Check if collection exists using REST API
    console.error('[initializeQdrant] Fetching collections...');
    const response = await axiosClient.get('/collections');
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch collections: ${response.status} ${JSON.stringify(response.data)}`);
    }
    
    const collections = response.data?.result?.collections || [];
    console.error(`[initializeQdrant] Found ${collections.length} collections`);
    const exists = collections.some((c: any) => c.name === COLLECTION_NAME);
    
    if (!exists) {
      // Create collection with environment-specific vector size
      console.error(`[initializeQdrant] Creating collection: ${COLLECTION_NAME}`);
      const createResponse = await axiosClient.put(`/collections/${COLLECTION_NAME}`, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine'
        },
        hnsw_config: {
          m: 16,
          ef_construct: 200
        }
      });
      
      if (createResponse.status !== 200) {
        throw new Error(`Failed to create collection: ${createResponse.status} ${JSON.stringify(createResponse.data)}`);
      }
      
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
    const response = await axiosClient.put(`/collections/${COLLECTION_NAME}/points`, {
      points: vectors
    });
    
    if (response.status !== 200) {
      throw new Error(`Failed to upsert vectors: ${response.status} ${JSON.stringify(response.data)}`);
    }
    
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
    // Build filter using Qdrant REST API format
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
    console.error(`[searchVectors] Filter payload: ${JSON.stringify(filter)}`);
    
    // Use axios to make direct REST API call to bypass JS client validation issues
    // Configure axios to not throw on any status code
    const response = await axios.post(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`,
      {
        vector: query,
        limit: Number(limit),
        filter,
        with_payload: true
      },
      {
        validateStatus: () => true  // Don't throw on any status code
      }
    );
    
    console.error(`[searchVectors] REST API response status: ${response.status}`);
    
    // Check for error responses
    if (response.status !== 200) {
      console.error(`[searchVectors] Error response: ${JSON.stringify(response.data)}`);
      throw new Error(`Qdrant search failed with status ${response.status}: ${JSON.stringify(response.data)}`);
    }
    
    // Parse response from REST API
    const results = response.data?.result || [];
    
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
      console.error(`[searchVectors] Error name: ${error.name}`);
      // Log the full error object for debugging
      const errorObj = error as Record<string, any>;
      if (errorObj.response) {
        console.error(`[searchVectors] Response status: ${errorObj.response.status}`);
        console.error(`[searchVectors] Response data: ${JSON.stringify(errorObj.response.data)}`);
      }
    }
    throw error;
  }
}

export { COLLECTION_NAME, VECTOR_SIZE };
