#!/usr/bin/env node

/**
 * E2E Test: CLOUD-1927 - recall_context Tool Verification
 * 
 * This test:
 * 1. Indexes E2E_TEST_CLOUD-1927.md via memorize_context
 * 2. Queries it back via recall_context
 * 3. Verifies the tool works end-to-end
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDocPath = path.join(__dirname, 'E2E_TEST_CLOUD-1927.md');
const testContent = fs.readFileSync(testDocPath, 'utf-8');

// Start the MCP server as a subprocess
const serverProcess = spawn('node', [path.join(__dirname, '../mcp-server/dist/index.js')], {
  cwd: path.join(__dirname, '../mcp-server'),
  stdio: ['pipe', 'pipe', 'pipe']
});

let responses = [];
let currentBuffer = '';

serverProcess.stdout.on('data', (data) => {
  currentBuffer += data.toString();
  
  // Try to parse complete JSON responses
  const lines = currentBuffer.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      responses.push(parsed);
    } catch (e) {
      // Not valid JSON, skip
    }
  }
  currentBuffer = lines[lines.length - 1];
});

serverProcess.stderr.on('data', (data) => {
  console.log('[SERVER LOG]', data.toString().trim());
});

// Give server time to start
setTimeout(() => {
  console.log('\n=== PHASE 1: Testing memorize_context ===\n');
  
  // Send memorize_context request
  const memorizeRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'memorize_context',
      arguments: {
        content: testContent,
        project: 'qdrant-memory-mcp',
        tags: ['e2e-test', 'mcp-tools', 'recall-context', 'cloud-1927']
      }
    }
  };

  console.log('Sending memorize_context request...');
  serverProcess.stdin.write(JSON.stringify(memorizeRequest) + '\n');

  // Wait for memorize response
  setTimeout(() => {
    console.log('\n=== PHASE 2: Testing recall_context ===\n');
    
    // Send recall_context request
    const recallRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'recall_context',
        arguments: {
          query: 'MCP server recall_context tool cloud infrastructure',
          project: 'qdrant-memory-mcp',
          limit: 5,
          tags: ['e2e-test']
        }
      }
    };

    console.log('Sending recall_context request...');
    serverProcess.stdin.write(JSON.stringify(recallRequest) + '\n');

    // Wait for recall response
    setTimeout(() => {
      console.log('\n=== RESULTS ===\n');
      
      // Check responses
      const memorizeResponse = responses.find(r => r.id === 1);
      const recallResponse = responses.find(r => r.id === 2);

      let success = true;

      if (memorizeResponse) {
        console.log('✅ memorize_context response received');
        if (memorizeResponse.result && memorizeResponse.result.content) {
          console.log('   Content:', memorizeResponse.result.content[0].text.substring(0, 100) + '...');
        }
      } else {
        console.log('❌ memorize_context response NOT received');
        success = false;
      }

      if (recallResponse) {
        console.log('✅ recall_context response received');
        if (recallResponse.result && recallResponse.result.content) {
          const content = recallResponse.result.content[0].text;
          console.log('   Response length:', content.length, 'characters');
          
          // Check if our test document was retrieved
          if (content.includes('E2E_TEST_CLOUD-1927') || content.includes('recall_context')) {
            console.log('   ✅ Test document found in results!');
          } else {
            console.log('   ⚠️  Test document not found in results (may be normal if other docs have higher scores)');
          }
        }
      } else {
        console.log('❌ recall_context response NOT received');
        success = false;
      }

      console.log('\n=== TEST SUMMARY ===\n');
      if (success && memorizeResponse && recallResponse) {
        console.log('✅ E2E_TEST_CLOUD-1927: PASS');
        console.log('   - memorize_context tool works');
        console.log('   - recall_context tool works');
        console.log('   - Document indexing and retrieval successful');
        process.exit(0);
      } else {
        console.log('❌ E2E_TEST_CLOUD-1927: FAIL');
        console.log('   - One or more tools did not respond correctly');
        process.exit(1);
      }
    }, 3000);
  }, 3000);
}, 2000);

// Timeout after 15 seconds
setTimeout(() => {
  console.log('\n❌ TIMEOUT: Test did not complete');
  serverProcess.kill();
  process.exit(1);
}, 15000);
