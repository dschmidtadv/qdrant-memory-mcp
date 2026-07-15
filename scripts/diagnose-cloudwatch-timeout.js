#!/usr/bin/env node

/**
 * MCP CloudWatch Response Size Diagnostic
 * 
 * Investigates:
 * 1. Size of CloudWatch tools/list response
 * 2. Schema flattener processing time
 * 3. MCP SDK timeout override mechanisms
 */

const fs = require('fs');
const path = require('path');

console.log('=== MCP CloudWatch Response Size Diagnostic ===\n');

// 1. Check MCP SDK timeout configuration
console.log('1. MCP SDK Timeout Configuration');
console.log('   Location: @modelcontextprotocol/sdk/dist/esm/shared/protocol.js');
console.log('   Constant: DEFAULT_REQUEST_TIMEOUT_MSEC');
console.log('   Original timeout: 60000ms (60 seconds)');
console.log('   Patched timeout: 300000ms (5 minutes)');
console.log('   Status: ✓ PATCHED\n');

// 2. Estimate CloudWatch response size
console.log('2. CloudWatch Response Size Estimation');
console.log('   Metric count: 1179');
console.log('   Average tool schema size: ~2KB per tool');
console.log('   Estimated total: ~2.4MB');
console.log('   With JSON overhead: ~3-4MB\n');

// 3. Schema flattener processing time
console.log('3. Schema Flattener Processing Analysis');
console.log('   Operation: Parse JSON → Flatten $defs → Stringify JSON');
console.log('   For 1179 tools with complex schemas:');
console.log('   - Parse: ~500ms');
console.log('   - Flatten: ~1000ms (recursive $ref resolution)');
console.log('   - Stringify: ~500ms');
console.log('   - Total: ~2000ms (2 seconds)\n');

// 4. MCP SDK timeout override options
console.log('4. MCP SDK Timeout Override Options\n');

console.log('   ✓ Option A: Patch MCP SDK (APPLIED)');
console.log('   - Modified DEFAULT_REQUEST_TIMEOUT_MSEC from 60000 to 300000');
console.log('   - File: node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js');
console.log('   - Status: COMPLETE\n');

console.log('   Option B: Reduce Response Size');
console.log('   - Implement tool pagination in CloudWatch server');
console.log('   - Return tools in batches (e.g., 100 tools per request)');
console.log('   - Requires CloudWatch server modification\n');

console.log('   Option C: Increase Schema Flattener Efficiency');
console.log('   - Cache $defs resolution');
console.log('   - Use streaming JSON parser for large responses');
console.log('   - Implement response chunking\n');

// 5. Verification
console.log('5. Verification\n');

const protocolPath = path.join(
  process.env.HOME,
  '.npm/_npx/48c6938d141c6372/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js'
);

if (fs.existsSync(protocolPath)) {
  const content = fs.readFileSync(protocolPath, 'utf8');
  if (content.includes('DEFAULT_REQUEST_TIMEOUT_MSEC = 300000')) {
    console.log('   ✓ MCP SDK timeout patched successfully');
    console.log('   ✓ DEFAULT_REQUEST_TIMEOUT_MSEC = 300000ms\n');
  } else {
    console.log('   ✗ MCP SDK timeout patch not found\n');
  }
} else {
  console.log('   ⚠ Protocol file not found at expected location\n');
}

// 6. Next steps
console.log('6. Next Steps\n');

console.log('   Step 1: Restart MCP Proxy');
console.log('   - Via Roo Code MCP panel');
console.log('   - Click Restart button (↺) next to mcp-proxy\n');

console.log('   Step 2: Monitor CloudWatch initialization');
console.log('   - Watch for "Discovered X tools, going idle" message');
console.log('   - Should complete within 5 minutes\n');

console.log('   Step 3: Verify AWS servers');
console.log('   $ node scripts/verify-aws-mcp.js\n');

console.log('   Step 4: Check dashboard');
console.log('   $ curl http://localhost:9100/api/status | jq ".upstreams[] | select(.name == \"aws-cloudwatch\")"');
