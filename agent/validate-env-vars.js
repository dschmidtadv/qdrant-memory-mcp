#!/usr/bin/env node

/**
 * Environment Variable Resolution Validator
 * 
 * This script validates that environment variables in roo-code-settings.json
 * are properly resolved. It checks for unresolved ${VAR} patterns and reports
 * which variables are missing.
 */

const fs = require('fs');
const path = require('path');

// Load config-loader
const { loadConfig } = require('./config-loader');

function validateEnvVars() {
  const configPath = path.join(__dirname, 'roo-code-settings.json');
  
  console.log('🔍 Environment Variable Resolution Validator\n');
  console.log(`📄 Config file: ${configPath}\n`);
  
  try {
    // Load raw config
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    const rawObj = JSON.parse(rawConfig);
    
    // Load processed config
    const processedConfig = loadConfig(configPath);
    
    // Find all unresolved variables
    const unresolvedVars = new Set();
    const resolvedVars = new Set();
    
    function findUnresolved(obj, path = '') {
      if (typeof obj === 'string') {
        const matches = obj.match(/\$\{([^}]+)\}/g);
        if (matches) {
          matches.forEach(match => {
            const varName = match.slice(2, -1);
            unresolvedVars.add(varName);
            console.log(`  ❌ Unresolved: ${varName} at ${path}`);
          });
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, idx) => findUnresolved(item, `${path}[${idx}]`));
      } else if (obj !== null && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          findUnresolved(value, `${path}.${key}`);
        });
      }
    }
    
    function findResolved(obj, path = '') {
      if (typeof obj === 'string') {
        // Check if this was a variable that got resolved
        const rawValue = getRawValue(rawObj, path);
        if (typeof rawValue === 'string' && rawValue.match(/\$\{([^}]+)\}/)) {
          const varName = rawValue.match(/\$\{([^}]+)\}/)[1];
          if (obj !== rawValue) {
            resolvedVars.add(varName);
          }
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, idx) => findResolved(item, `${path}[${idx}]`));
      } else if (obj !== null && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          findResolved(value, `${path}.${key}`);
        });
      }
    }
    
    function getRawValue(obj, path) {
      const parts = path.split('.').filter(p => !p.includes('['));
      let current = obj;
      for (const part of parts) {
        if (current && typeof current === 'object') {
          current = current[part];
        } else {
          return undefined;
        }
      }
      return current;
    }
    
    console.log('📋 Checking for unresolved variables in processed config:\n');
    findUnresolved(processedConfig);
    
    console.log('\n✅ Checking for resolved variables:\n');
    findResolved(processedConfig);
    
    if (resolvedVars.size > 0) {
      console.log(`  ✓ Resolved: ${Array.from(resolvedVars).join(', ')}`);
    }
    
    // Check environment variables
    console.log('\n🔐 Environment Variables Status:\n');
    const requiredVars = [
      'AWS_ACCESS_KEY',
      'AWS_SECRET_KEY',
      'AWS_REGION',
      'AWS_PROFILE',
      'GEMINI_API_KEY',
      'OPENROUTER_API_KEY',
      'LITELLM_BASE_URL',
      'LITELLM_API_KEY',
      'AWS_BEDROCK_CUSTOM_ARN',
      'AWS_BEDROCK_CUSTOM_ARN_HAIKU'
    ];
    
    let missingCount = 0;
    requiredVars.forEach(varName => {
      if (process.env[varName]) {
        console.log(`  ✓ ${varName}: SET`);
      } else {
        console.log(`  ✗ ${varName}: MISSING`);
        missingCount++;
      }
    });
    
    // Summary
    console.log('\n📊 Summary:\n');
    console.log(`  Unresolved variables: ${unresolvedVars.size}`);
    console.log(`  Resolved variables: ${resolvedVars.size}`);
    console.log(`  Missing env vars: ${missingCount}`);
    
    if (unresolvedVars.size === 0 && missingCount === 0) {
      console.log('\n✅ All environment variables are properly resolved!\n');
      return 0;
    } else {
      console.log('\n⚠️  Some environment variables are not resolved.\n');
      console.log('📝 To fix this:\n');
      console.log('  1. Copy agent/.env.example to agent/.env');
      console.log('  2. Edit agent/.env and fill in actual values');
      console.log('  3. Ensure dotenv is installed: npm install dotenv');
      console.log('  4. Run this validator again\n');
      return 1;
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}\n`);
    return 1;
  }
}

process.exit(validateEnvVars());
