#!/usr/bin/env node

/**
 * Test script to verify recall_context tool is available and working
 * This simulates an MCP client connecting to the server
 */

const { spawn } = require('child_process');
const path = require('path');

// Start the MCP server as a subprocess
const serverProcess = spawn('node', [path.join(__dirname, '../mcp-server/dist/index.js')], {
  cwd: path.join(__dirname, '../mcp-server'),
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverOutput = '';
let serverError = '';

serverProcess.stdout.on('data', (data) => {
  serverOutput += data.toString();
  console.log('[SERVER STDOUT]', data.toString());
});

serverProcess.stderr.on('data', (data) => {
  serverError += data.toString();
  console.log('[SERVER STDERR]', data.toString());
});

// Give server time to start
setTimeout(() => {
  // Send ListTools request
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  };

  console.log('\n=== Sending ListTools request ===');
  console.log(JSON.stringify(listToolsRequest, null, 2));
  
  serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');

  // Wait for response
  setTimeout(() => {
    console.log('\n=== Server Output ===');
    console.log(serverOutput);
    console.log('\n=== Server Error ===');
    console.log(serverError);

    // Check if recall_context is in the output
    if (serverOutput.includes('recall_context')) {
      console.log('\n✅ SUCCESS: recall_context tool is available!');
      process.exit(0);
    } else {
      console.log('\n❌ FAILURE: recall_context tool not found in server response');
      process.exit(1);
    }
  }, 2000);
}, 2000);

// Timeout after 10 seconds
setTimeout(() => {
  console.log('\n❌ TIMEOUT: Server did not respond');
  serverProcess.kill();
  process.exit(1);
}, 10000);
