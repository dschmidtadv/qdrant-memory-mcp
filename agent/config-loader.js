#!/usr/bin/env node

/**
 * Config Loader with Environment Variable Support
 * 
 * This script loads roo-code-settings.json and substitutes environment variables
 * for all sensitive credentials. It ensures secrets are never hardcoded in the config file.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Recursively replace environment variable references in an object
 * @param {*} obj - Object to process
 * @returns {*} - Object with env vars substituted
 */
function substituteEnvVars(obj) {
  if (typeof obj === 'string') {
    // Replace ${ENV_VAR} patterns with actual environment variables
    return obj.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const value = process.env[envVar];
      if (value === undefined) {
        console.warn(`Warning: Environment variable ${envVar} not found`);
        return match; // Return original if not found
      }
      return value;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map(item => substituteEnvVars(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }

  return obj;
}

/**
 * Load and process the configuration file
 * @param {string} configPath - Path to the config file
 * @returns {object} - Processed configuration
 */
function loadConfig(configPath) {
  try {
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(rawConfig);
    return substituteEnvVars(config);
  } catch (error) {
    console.error(`Error loading config from ${configPath}:`, error.message);
    process.exit(1);
  }
}

// Export for use as a module
module.exports = { loadConfig, substituteEnvVars };

// If run directly, load and print the config
if (require.main === module) {
  const configPath = path.join(__dirname, 'roo-code-settings.json');
  const config = loadConfig(configPath);
  console.log(JSON.stringify(config, null, 2));
}
