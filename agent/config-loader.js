#!/usr/bin/env node

/**
 * Config Loader with Environment Variable Support
 *
 * This script loads roo-code-settings.json and substitutes environment variables
 * for all sensitive credentials. It ensures secrets are never hardcoded in the config file.
 *
 * Usage:
 *   node config-loader.js                    # Load from default location
 *   node config-loader.js /path/to/config    # Load from custom path
 *   node config-loader.js --validate         # Validate env vars
 *   node config-loader.js --debug            # Show debug info
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DEBUG = process.argv.includes('--debug');
const VALIDATE_ONLY = process.argv.includes('--validate');

function log(message, level = 'info') {
  if (level === 'debug' && !DEBUG) return;
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': 'ℹ️ ',
    'warn': '⚠️ ',
    'error': '❌',
    'debug': '🔍',
    'success': '✅'
  }[level] || '•';
  console.error(`${prefix} [${timestamp}] ${message}`);
}

function loadDotenvIfAvailable() {
  try {
    // Try to load .env from agent directory first, then current directory
    const agentEnvPath = path.join(__dirname, '.env');
    let loadedEnvPath = agentEnvPath;
    let result = require('dotenv').config({ path: agentEnvPath });
    
    if (result.error && result.error.code === 'ENOENT') {
      // If agent/.env doesn't exist, try current directory
      loadedEnvPath = path.join(process.cwd(), '.env');
      result = require('dotenv').config();
    }
    
    if (result.error) {
      log(`dotenv: ${result.error.message}`, 'debug');
    } else {
      log(`Loaded ${Object.keys(result.parsed || {}).length} variables from ${loadedEnvPath}`, 'debug');
    }
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') {
      log(`Failed to load dotenv: ${error.message}`, 'warn');
    } else {
      log('dotenv not installed (optional)', 'debug');
    }
  }
}

loadDotenvIfAvailable();

/**
 * Recursively replace environment variable references in an object
 * @param {*} obj - Object to process
 * @param {string} path - Current path in object (for debugging)
 * @returns {*} - Object with env vars substituted
 */
function substituteEnvVars(obj, currentPath = '') {
  if (typeof obj === 'string') {
    // Replace ${ENV_VAR} patterns with actual environment variables
    return obj.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const value = process.env[envVar];
      if (value === undefined) {
        log(`Unresolved: ${envVar} at ${currentPath}`, 'warn');
        return match; // Return original if not found
      }
      log(`Resolved: ${envVar} at ${currentPath} (length: ${value.length})`, 'debug');
      return value;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map((item, idx) => substituteEnvVars(item, `${currentPath}[${idx}]`));
  }

  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      result[key] = substituteEnvVars(value, newPath);
    }
    return result;
  }

  return obj;
}

/**
 * Validate that all environment variables are resolved
 * @param {object} config - Configuration object
 * @returns {object} - Validation result
 */
function validateConfig(config) {
  const unresolvedVars = new Set();
  const resolvedVars = new Set();
  
  function findUnresolved(obj) {
    if (typeof obj === 'string') {
      const matches = obj.match(/\$\{([^}]+)\}/g);
      if (matches) {
        matches.forEach(match => {
          const varName = match.slice(2, -1);
          unresolvedVars.add(varName);
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => findUnresolved(item));
    } else if (obj !== null && typeof obj === 'object') {
      Object.values(obj).forEach(value => findUnresolved(value));
    }
  }
  
  findUnresolved(config);
  
  // Check which env vars are set
  const commonVars = [
    'AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'AWS_REGION', 'AWS_PROFILE',
    'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LITELLM_BASE_URL', 'LITELLM_API_KEY',
    'AWS_BEDROCK_CUSTOM_ARN', 'AWS_BEDROCK_CUSTOM_ARN_HAIKU'
  ];
  
  commonVars.forEach(varName => {
    if (process.env[varName]) {
      resolvedVars.add(varName);
    }
  });
  
  return {
    unresolved: Array.from(unresolvedVars),
    resolved: Array.from(resolvedVars),
    isValid: unresolvedVars.size === 0
  };
}

/**
 * Load and process the configuration file
 * @param {string} configPath - Path to the config file
 * @returns {object} - Processed configuration
 */
function loadConfig(configPath) {
  try {
    log(`Loading config from: ${configPath}`, 'debug');
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(rawConfig);
    log(`Parsed config with ${Object.keys(config).length} top-level keys`, 'debug');
    
    const processed = substituteEnvVars(config);
    log('Environment variables substituted', 'success');
    
    return processed;
  } catch (error) {
    log(`Error loading config: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Export for use as a module
module.exports = { loadConfig, substituteEnvVars, validateConfig };

// If run directly, load and print the config
if (require.main === module) {
  // Find config path from arguments (skip node and script name)
  let configPath = null;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg.startsWith('--') && !arg.startsWith('-')) {
      configPath = arg;
      break;
    }
  }
  
  // Use default if no config path provided
  if (!configPath) {
    configPath = path.join(__dirname, 'roo-code-settings.json');
  } else if (!path.isAbsolute(configPath)) {
    configPath = path.resolve(process.cwd(), configPath);
  }
  
  const config = loadConfig(configPath);
  
  if (VALIDATE_ONLY) {
    const validation = validateConfig(config);
    console.log(JSON.stringify(validation, null, 2));
    process.exit(validation.isValid ? 0 : 1);
  } else {
    console.log(JSON.stringify(config, null, 2));
  }
}
