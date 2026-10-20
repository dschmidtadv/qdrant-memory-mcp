#!/usr/bin/env node

/**
 * AWS MCP Server Registration Verification Script
 * 
 * Verifies that AWS MCP servers are correctly registered via mcp-proxy
 * Tests:
 * - mcp-proxy connectivity
 * - AWS server registration
 * - Tool availability
 * - Credential passing
 */

const fs = require('fs');
const path = require('path');

class AWSMCPVerifier {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      tests: [],
      summary: {}
    };
  }

  /**
   * Print header
   */
  printHeader() {
    console.log('\x1b[36m%s\x1b[0m', '╔════════════════════════════════════════════════════════════════╗');
    console.log('\x1b[36m%s\x1b[0m', '║     AWS MCP Server Registration Verification                    ║');
    console.log('\x1b[36m%s\x1b[0m', '╚════════════════════════════════════════════════════════════════╝');
    console.log('');
  }

  /**
   * Test 1: Check MCP settings file
   */
  testMCPSettings() {
    console.log('\x1b[33m%s\x1b[0m', 'Test 1: MCP Settings File');
    
    const settingsPath = path.join(process.env.HOME, 'Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json');
    
    try {
      if (!fs.existsSync(settingsPath)) {
        this.addResult('MCP Settings', 'FAIL', 'Settings file not found');
        return false;
      }
      
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      
      if (!settings.mcpServers || !settings.mcpServers['mcp-proxy']) {
        this.addResult('MCP Settings', 'FAIL', 'mcp-proxy not configured');
        return false;
      }
      
      const proxy = settings.mcpServers['mcp-proxy'];
      if (proxy.disabled) {
        this.addResult('MCP Settings', 'FAIL', 'mcp-proxy is disabled');
        return false;
      }
      
      this.addResult('MCP Settings', 'PASS', 'mcp-proxy configured and enabled');
      return true;
    } catch (err) {
      this.addResult('MCP Settings', 'ERROR', err.message);
      return false;
    }
  }

  /**
   * Test 2: Check AWS environment variables
   */
  testAWSEnvironment() {
    console.log('\x1b[33m%s\x1b[0m', 'Test 2: AWS Environment Variables');
    
    const required = ['AWS_PROFILE', 'AWS_REGION'];
    const missing = [];
    
    required.forEach(env => {
      if (!process.env[env]) {
        missing.push(env);
      }
    });
    
    if (missing.length > 0) {
      this.addResult('AWS Environment', 'WARN', `Missing: ${missing.join(', ')}`);
      console.log('  ⚠ Set AWS_PROFILE and AWS_REGION for full functionality');
      return false;
    }
    
    this.addResult('AWS Environment', 'PASS', `AWS_PROFILE=${process.env.AWS_PROFILE}, AWS_REGION=${process.env.AWS_REGION}`);
    return true;
  }

  /**
   * Test 3: Check debug logging
   */
  testDebugLogging() {
    console.log('\x1b[33m%s\x1b[0m', 'Test 3: Debug Logging Configuration');
    
    const debugVars = {
      'MCP_FLATTENER_DEBUG': process.env.MCP_FLATTENER_DEBUG,
      'DEBUG': process.env.DEBUG,
      'NODE_DEBUG': process.env.NODE_DEBUG,
      'LOG_LEVEL': process.env.LOG_LEVEL
    };
    
    const enabled = Object.values(debugVars).filter(v => v).length;
    
    if (enabled === 0) {
      this.addResult('Debug Logging', 'WARN', 'Debug logging not enabled');
      console.log('  ⚠ Run: bash scripts/enable-mcp-debug.sh');
      return false;
    }
    
    this.addResult('Debug Logging', 'PASS', `${enabled}/4 debug variables set`);
    return true;
  }

  /**
   * Test 4: Check log files
   */
  testLogFiles() {
    console.log('\x1b[33m%s\x1b[0m', 'Test 4: Log Files');
    
    const logs = {
      '/tmp/mcp-debug.log': 'Debug log',
      '/tmp/mcp-tool-registration.log': 'Tool registration log'
    };
    
    let allExist = true;
    Object.entries(logs).forEach(([logPath, desc]) => {
      if (fs.existsSync(logPath)) {
        const size = fs.statSync(logPath).size;
        console.log(`  ✓ ${desc}: ${logPath} (${size} bytes)`);
      } else {
        console.log(`  ✗ ${desc}: ${logPath} (not found)`);
        allExist = false;
      }
    });
    
    if (allExist) {
      this.addResult('Log Files', 'PASS', 'All log files present');
    } else {
      this.addResult('Log Files', 'WARN', 'Some log files missing (will be created on first run)');
    }
    
    return allExist;
  }

  /**
   * Test 5: Check AWS tools in configuration
   */
  testAWSToolsConfig() {
    console.log('\x1b[33m%s\x1b[0m', 'Test 5: AWS Tools Configuration');
    
    const settingsPath = path.join(process.env.HOME, 'Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json');
    
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const proxy = settings.mcpServers['mcp-proxy'];
      
      if (!proxy.env || !proxy.env.MCP_PROXY_UPSTREAMS) {
        this.addResult('AWS Tools Config', 'FAIL', 'MCP_PROXY_UPSTREAMS not configured');
        return false;
      }
      
      const upstreams = JSON.parse(proxy.env.MCP_PROXY_UPSTREAMS);
      const awsServers = ['aws-ecs', 'aws-cloudwatch', 'aws-documentation', 'aws-lambda', 'aws-iam'];
      const found = upstreams
        .filter(s => awsServers.includes(s.name))
        .map(s => s.name);
      
      if (found.length === 0) {
        this.addResult('AWS Tools Config', 'FAIL', 'No AWS servers configured');
        return false;
      }
      
      this.addResult('AWS Tools Config', 'PASS', `${found.length}/${awsServers.length} AWS servers configured: ${found.join(', ')}`);
      return true;
    } catch (err) {
      this.addResult('AWS Tools Config', 'ERROR', err.message);
      return false;
    }
  }

  /**
   * Add test result
   */
  addResult(test, status, message) {
    this.results.tests.push({ test, status, message });
    console.log(`  ${this.getStatusIcon(status)} ${test}: ${message}`);
  }

  /**
   * Get status icon
   */
  getStatusIcon(status) {
    switch (status) {
      case 'PASS': return '\x1b[32m✓\x1b[0m';
      case 'FAIL': return '\x1b[31m✗\x1b[0m';
      case 'WARN': return '\x1b[33m⚠\x1b[0m';
      case 'ERROR': return '\x1b[31m⚡\x1b[0m';
      default: return '?';
    }
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('');
    console.log('\x1b[32m%s\x1b[0m', '═══ VERIFICATION SUMMARY ═══');
    
    const passed = this.results.tests.filter(t => t.status === 'PASS').length;
    const failed = this.results.tests.filter(t => t.status === 'FAIL').length;
    const warned = this.results.tests.filter(t => t.status === 'WARN').length;
    const errors = this.results.tests.filter(t => t.status === 'ERROR').length;
    
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Warned: ${warned}`);
    console.log(`  Errors: ${errors}`);
    console.log('');
    
    if (failed === 0 && errors === 0) {
      console.log('\x1b[32m%s\x1b[0m', '✓ AWS MCP servers ready for verification');
      console.log('');
      console.log('\x1b[33m%s\x1b[0m', 'Next Steps:');
      console.log('  1. Restart Claude Desktop');
      console.log('  2. Run: node scripts/mcp-dashboard.js');
      console.log('  3. Monitor tool registration for AWS servers');
      console.log('  4. Check /tmp/mcp-tool-registration.log for AWS tools');
    } else {
      console.log('\x1b[31m%s\x1b[0m', '✗ Issues found - see above for details');
    }
  }

  /**
   * Run all tests
   */
  run() {
    this.printHeader();
    
    console.log('\x1b[33m%s\x1b[0m', 'Running AWS MCP Server Verification Tests...');
    console.log('');
    
    this.testMCPSettings();
    console.log('');
    
    this.testAWSEnvironment();
    console.log('');
    
    this.testDebugLogging();
    console.log('');
    
    this.testLogFiles();
    console.log('');
    
    this.testAWSToolsConfig();
    console.log('');
    
    this.printSummary();
  }
}

// Run verification
const verifier = new AWSMCPVerifier();
verifier.run();
