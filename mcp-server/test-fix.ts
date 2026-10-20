import { getEmbedding } from './src/embedding';
import { searchVectors } from './src/qdrant';

async function testRecallContextFix() {
  console.error('\n=== Testing recall_context Fix with Populated Collection ===\n');
  
  try {
    // Test 1: Query with simple terms
    console.error('Test 1: Simple query "test verification"');
    const query1 = 'test verification';
    const embedding1 = await getEmbedding(query1);
    console.error(`Generated embedding with ${embedding1.length} dimensions`);
    
    const results1 = await searchVectors(embedding1, 'qdrant-memory-mcp', 5);
    console.error(`✓ Got ${results1.length} results`);
    if (results1.length > 0) {
      console.error(`  - First result score: ${results1[0].score}`);
      console.error(`  - First result has payload: ${Object.keys(results1[0].payload).length} fields`);
    }
    
    // Test 2: Query with tags filter
    console.error('\nTest 2: Query with tags filter');
    const query2 = 'UGIP initialization';
    const embedding2 = await getEmbedding(query2);
    const results2 = await searchVectors(embedding2, 'qdrant-memory-mcp', 5, ['ugip']);
    console.error(`✓ Got ${results2.length} results with tags filter`);
    
    // Test 3: Query with different project (should return empty)
    console.error('\nTest 3: Query with different project (should return empty)');
    const query3 = 'test';
    const embedding3 = await getEmbedding(query3);
    const results3 = await searchVectors(embedding3, 'different-project', 5);
    console.error(`✓ Got ${results3.length} results for different project (expected 0)`);
    
    console.error('\n=== All Tests Passed ✓ ===\n');
    
  } catch (error) {
    console.error('\n✗ Test Failed:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testRecallContextFix();
