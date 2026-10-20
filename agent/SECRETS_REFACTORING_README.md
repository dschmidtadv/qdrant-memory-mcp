# Secrets Externalization Refactoring

## Overview

This refactoring externalizes all hardcoded secrets from `roo-code-settings.json` to environment variables, ensuring sensitive credentials are never committed to the repository.

## Files Created

### 1. `.env` (Git-ignored)
Contains all actual secret values for local development. This file is added to `.gitignore` and should never be committed.

**Location:** `agent/.env`

**Contents:**
- AWS credentials (access key, secret key, region, profile)
- API keys (Gemini, OpenRouter, LiteLLM)
- Base URLs for various LLM providers
- Custom ARNs for AWS Bedrock
- Developer identifiers

### 2. `.env.example` (Git-tracked)
Template file documenting all required environment variables with placeholder values. This serves as documentation for developers setting up the project.

**Location:** `agent/.env.example`

**Purpose:**
- Provides a reference for all required environment variables
- Includes descriptions for each variable
- Helps new developers understand the configuration structure

### 3. `roo-code-settings-refactored.json` (Git-tracked)
Refactored configuration file with all hardcoded secrets replaced by `${ENV_VAR}` placeholders.

**Location:** `agent/roo-code-settings-refactored.json`

**Changes:**
- All AWS credentials replaced with `${AWS_ACCESS_KEY}`, `${AWS_SECRET_KEY}`, etc.
- All API keys replaced with corresponding `${API_KEY_NAME}` references
- All base URLs replaced with `${BASE_URL_NAME}` references
- Configuration structure remains identical for backward compatibility

### 4. `config-loader.js` (Git-tracked)
Node.js utility script that loads the refactored configuration and substitutes environment variables at runtime.

**Location:** `agent/config-loader.js`

**Features:**
- Loads `.env` file using `dotenv` package
- Recursively processes configuration objects
- Replaces `${ENV_VAR}` patterns with actual environment variable values
- Provides warnings for missing environment variables
- Can be used as a module or CLI tool

**Usage:**
```javascript
// As a module
const { loadConfig } = require('./config-loader');
const config = loadConfig('./roo-code-settings-refactored.json');

// As CLI
node config-loader.js > config-output.json
```

## Environment Variables Reference

### AWS Configuration
- `AWS_ACCESS_KEY` - AWS IAM access key for Bedrock API
- `AWS_SECRET_KEY` - AWS IAM secret key for Bedrock API
- `AWS_REGION` - AWS region (default: us-east-1)
- `AWS_PROFILE` - AWS profile name
- `AWS_BEDROCK_CUSTOM_ARN` - Custom ARN for Bedrock inference profile
- `AWS_BEDROCK_CUSTOM_ARN_HAIKU` - Custom ARN for Haiku model

### API Keys
- `GEMINI_API_KEY` - Google AI Studio (Gemini) API key
- `OPENROUTER_API_KEY` - OpenRouter API key

### LiteLLM Configuration
- `LITELLM_BASE_URL` - Local LiteLLM proxy base URL
- `LITELLM_API_KEY` - LiteLLM API key
- `LITELLM_REMOTE_BASE_URL` - Remote/hosted LiteLLM base URL (if using a shared proxy instead of a local one)
- `LITELLM_REMOTE_API_KEY` - Remote/hosted LiteLLM API key

### OpenAI Configuration
- `OPENAI_BASE_URL` - Local OpenAI-compatible endpoint
- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_TEST_BASE_URL` *(optional)* - Test environment base URL; only needed for local test overrides
- `OPENAI_TEST_API_KEY` *(optional)* - Test environment API key; only needed for local test overrides
- `OPENAI_TEST_MODEL_ID` *(optional)* - Test model identifier; only needed for local test overrides

### Anthropic Configuration
- `ANTHROPIC_BASE_URL` - Anthropic endpoint (override if routing through a proxy)

### Developer Information
- `DEVELOPER_ID` *(optional)* - Developer identifier; not referenced by core configs
- `APP_ID` *(optional)* - Application identifier; not referenced by core configs

### CDN Configuration
- `CLOUDFRONT_DOMAIN` *(optional)* - CloudFront domain for CDN access; not referenced by core configs

## Setup Instructions

### For Local Development

1. **Copy the example file:**
   ```bash
   cp agent/.env.example agent/.env
   ```

2. **Fill in actual values:**
   ```bash
   # Edit agent/.env with your actual credentials
   nano agent/.env
   ```

3. **Verify `.env` is in `.gitignore`:**
   The repo's `.gitignore` and `agent/.gitignore` already exclude `.env`. To confirm:
   ```bash
   grep ".env" agent/.gitignore
   ```

4. **Load configuration in your application:**
   ```javascript
   const { loadConfig } = require('./config-loader');
   const config = loadConfig('./roo-code-settings.json');
   ```

> **Automated setup:** Run `make install-modes` to automatically create all required symlinks, including the settings symlink pointing to `agent/roo-code-settings.json`.

### For CI/CD Environments

1. **Set environment variables in your CI/CD platform:**
   - GitHub Actions: Use repository secrets
   - GitLab CI: Use CI/CD variables
   - Jenkins: Use credentials plugin

2. **Example GitHub Actions:**
   ```yaml
   env:
     AWS_ACCESS_KEY: ${{ secrets.AWS_ACCESS_KEY }}
     AWS_SECRET_KEY: ${{ secrets.AWS_SECRET_KEY }}
     GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
     # ... other secrets
   ```

### For Docker/Container Environments

1. **Pass environment variables at runtime:**
   ```bash
   docker run -e AWS_ACCESS_KEY=xxx -e AWS_SECRET_KEY=yyy myapp
   ```

2. **Or use .env file with docker-compose:**
   ```yaml
   services:
     app:
       environment:
         - AWS_ACCESS_KEY=${AWS_ACCESS_KEY}
         - AWS_SECRET_KEY=${AWS_SECRET_KEY}
   ```

## Security Best Practices

✅ **DO:**
- Store `.env` in `.gitignore`
- Use strong, unique API keys
- Rotate credentials regularly
- Use different credentials per environment (dev, staging, prod)
- Store secrets in secure vaults (AWS Secrets Manager, HashiCorp Vault, etc.)
- Use IAM roles instead of access keys when possible

❌ **DON'T:**
- Commit `.env` to version control
- Share `.env` files via email or chat
- Use the same credentials across environments
- Log or print environment variables
- Hardcode secrets in application code

## Migration Path

### Step 1: Backup Original
```bash
cp ~/Documents/Roo_Memory/manifests/roo-code-settings.json \
   ~/Documents/Roo_Memory/manifests/roo-code-settings.json.backup
```

### Step 2: Replace Configuration
```bash
cp agent/roo-code-settings-refactored.json \
   ~/Documents/Roo_Memory/manifests/roo-code-settings.json
```

### Step 3: Update Application Code
Replace direct config loading with the config-loader:
```javascript
// Before
const config = require('./roo-code-settings.json');

// After
const { loadConfig } = require('./config-loader');
const config = loadConfig('./roo-code-settings.json');
```

### Step 4: Test
```bash
# Verify config loads correctly
node config-loader.js | jq '.providerProfiles.apiConfigs.bedrock'
```

## Troubleshooting

### Missing Environment Variables
If you see warnings about missing environment variables:
```
Warning: Environment variable AWS_ACCESS_KEY not found
```

**Solution:** Ensure all required variables are set in `.env`:
```bash
# Check which variables are missing
grep "Warning:" config-loader.js output.log
```

### Config Not Loading
If the config fails to load:
```bash
# Verify .env file exists and is readable
ls -la agent/.env

# Check for syntax errors in .env
cat agent/.env | grep -E "^[A-Z_]+=.*"

# Test config-loader directly (run from repo root)
node agent/config-loader.js
```

### Secrets Still Visible
If secrets appear in logs or output:
```bash
# Ensure config-loader is being used
grep -r "require.*roo-code-settings.json" --include="*.js" | grep -v config-loader

# Replace direct requires with config-loader
```

## Verification Checklist

- [ ] `.env` file created with actual secrets
- [ ] `.env.example` created with placeholder values
- [ ] `roo-code-settings-refactored.json` created with `${ENV_VAR}` references
- [ ] `config-loader.js` created and tested
- [ ] `.env` added to `.gitignore`
- [ ] All environment variables documented in `.env.example`
- [ ] Application code updated to use `config-loader`
- [ ] Configuration loads successfully with `node config-loader.js`
- [ ] No hardcoded secrets in git history (use `git-secrets` to verify)
- [ ] CI/CD environment variables configured

## Related Files

- Original config: `~/Documents/Roo_Memory/manifests/roo-code-settings.json`
- Backup: `~/Documents/Roo_Memory/manifests/roo-code-settings.json.backup`
- Refactored config: `agent/roo-code-settings-refactored.json`
- Environment template: `agent/.env.example`
- Config loader: `agent/config-loader.js`

## Support

For questions or issues with this refactoring:
1. Check the `.env.example` file for variable descriptions
2. Review the `config-loader.js` source code
3. Consult the troubleshooting section above
4. Check git history for previous configuration patterns
