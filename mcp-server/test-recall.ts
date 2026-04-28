import { QdrantClient } from '@qdrant/js-client-rest';

async function testRecallContext() {
  const client = new QdrantClient({ url: 'http://localhost:6333' });
  
  try {
    // Create a test vector (768 dimensions)
    const testVector = Array(768).fill(0.1);
    
    console.error('Testing recall_context with populated collection...');
    console.error('Query vector dimensions:', testVector.length);
    
    // Test search with filter
    const response: any = await client.search('agent-memory', {
      vector: testVector,
      limit: 5,
      filter: {
        must: [
          {
            key: 'project',
            match: { value: 'qdrant-memory-mcp' }
          }
        ]
      },
      with_payload: true
    });
    
    console.error('\n=== RESPONSE FROM client.search() ===');
    console.error('Response type:', typeof response);
    console.error('Is Array:', Array.isArray(response));
    console.error('Response keys:', Object.keys(response || {}).join(', '));
    console.error('\nFull response (first 1000 chars):');
    console.error(JSON.stringify(response, null, 2).substring(0, 1000));
    
    if (Array.isArray(response)) {
      console.error('\n✓ Response is a direct array with', response.length, 'results');
    } else if (response && response.result) {
      console.error('\n✓ Response has .result property with', response.result.length, 'results');
    } else if (response && response.points) {
      console.error('\n✓ Response has .points property with', response.points.length, 'results');
    } else {
      console.error('\n✗ Response structure not recognized');
    }
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && 'response' in error) {
      const err = error as any;
      console.error('Response status:', err.response?.status);
      console.error('Response data:', err.response?.data);
    }
  }
}

testRecallContext();
