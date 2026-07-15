# Environment Variable Resolution Setup Guide

## Overview

When you import `roo-code-settings.json` into Cline, environment variables like `${AWS_ACCESS_KEY}` are **not automatically resolved**. This guide explains why and how to fix it.

## The Problem

### Why Variables Aren't Resolved

1. **Direct JSON Import**: Cline reads `roo-code-settings.json` as static JSON
2. **No Processing**: The `config-loader.js` script is never invoked
3. **Literal Strings**: Variables remain as `${VAR}` instead of actual values
4. **Silent Failure**: Credentials appear as template strings, causing authentication failures

### Example

```json
{
  "bedrock": {
    "awsAccessKey": "${AWS_ACCESS_KEY}",  // ❌ NOT resolved
    "awsSecretKey": "${AWS_SECRET_KEY}"   // ❌ NOT resolved
  }
}
```

## The Solution

### Step 1: Create `.env` File

```bash
cd agent
cp .env.example .env
```

### Step 2: Edit `.env` with Actual Values

Open `agent/.env` and fill in your actual credentials:

```bash
# AWS Credentials for Bedrock
AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
AWS_PROFILE=default

# Google AI Studio (Gemini)
GEMINI_API_KEY=your-actual-gemini-key

# OpenRouter
OPENROUTER_API_KEY=your-actual-openrouter-key

# LiteLLM Configuration
LITELLM_BASE_URL=http://localhost:4000/v1
LITELLM_API_KEY=your-actual-litellm-key

# AWS Bedrock Custom ARN
AWS_BEDROCK_CUSTOM_ARN=arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-profile
AWS_BEDROCK_CUSTOM_ARN_HAIKU=arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/haiku-profile
```

### Step 3: Verify `.env` is in `.gitignore`

Ensure your `.env` file is never committed:

```bash
# Check if .env is ignored
grep "^\.env" .gitignore

# If not present, add it
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

### Step 4: Install dotenv (if needed)

The `config-loader.js` requires the `dotenv` package:

```bash
cd agent
npm install dotenv
```

Or if using a global Node setup:

```bash
npm install -g dotenv
```

### Step 5: Validate Environment Variables

Run the validation script to verify everything is working:

```bash
node agent/validate-env-vars.js
```

**Expected Output:**

```
🔍 Environment Variable Resolution Validator

📄 Config file: /path/to/agent/roo-code-settings.json

📋 Checking for unresolved variables in processed config:

✅ Checking for resolved variables:

  ✓ Resolved: AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION, ...

🔐 Environment Variables Status:

  ✓ AWS_ACCESS_KEY: SET
  ✓ AWS_SECRET_KEY: SET
  ✓ AWS_REGION: SET
  ✓ AWS_PROFILE: SET
  ✓ GEMINI_API_KEY: SET
  ✓ OPENROUTER_API_KEY: SET
  ✓ LITELLM_BASE_URL: SET
  ✓ LITELLM_API_KEY: SET
  ✓ AWS_BEDROCK_CUSTOM_ARN: SET
  ✓ AWS_BEDROCK_CUSTOM_ARN_HAIKU: SET

📊 Summary:

  Unresolved variables: 0
  Resolved variables: 10
  Missing env vars: 0

✅ All environment variables are properly resolved!
```

## How It Works

### The Flow

```
1. You create agent/.env with actual values
   ↓
2. config-loader.js loads .env via dotenv.config()
   ↓
3. substituteEnvVars() replaces ${VAR} with process.env[VAR]
   ↓
4. Cline receives fully resolved configuration
   ↓
5. API calls use actual credentials
```

### Key Files

| File | Purpose |
|------|---------|
| `agent/.env` | Your actual environment variables (NEVER commit) |
| `agent/.env.example` | Template for required variables (commit this) |
| `agent/config-loader.js` | Loads `.env` and resolves `${VAR}` patterns |
| `agent/validate-env-vars.js` | Validates that variables are resolved |
| `agent/roo-code-settings.json` | Configuration with `${VAR}` placeholders |

## Troubleshooting

### Issue: "Environment variable X not found"

**Solution:**
```bash
# Check if .env file exists
ls -la agent/.env

# Check if variable is set
grep "AWS_ACCESS_KEY" agent/.env

# Verify it's not commented out
grep "^AWS_ACCESS_KEY=" agent/.env
```

### Issue: Variables Still Show as `${VAR}`

**Solution:**
```bash
# Verify dotenv is installed
npm list dotenv

# If not installed:
npm install dotenv

# Test config-loader directly
node agent/config-loader.js | grep AWS_ACCESS_KEY
```

### Issue: "Cannot find module 'dotenv'"

**Solution:**
```bash
# Install dotenv in agent directory
cd agent
npm install dotenv

# Or install globally
npm install -g dotenv
```

### Issue: Cline Still Not Using Resolved Variables

**Solution:**
1. Restart Cline/VSCode completely
2. Verify `.env` file exists and has values
3. Run validation script: `node agent/validate-env-vars.js`
4. Check that `config-loader.js` is being called in your integration

## Security Best Practices

### ✅ DO

- ✓ Create `.env` from `.env.example`
- ✓ Add `.env` to `.gitignore`
- ✓ Use strong, unique credentials
- ✓ Rotate credentials regularly
- ✓ Use AWS IAM roles when possible
- ✓ Validate variables before use

### ❌ DON'T

- ✗ Commit `.env` to version control
- ✗ Share `.env` files via email or chat
- ✗ Hardcode credentials in JSON files
- ✗ Use test credentials in production
- ✗ Log environment variables
- ✗ Store credentials in plain text

## Testing Your Setup

### Test 1: Verify Config Loader Works

```bash
node agent/config-loader.js | jq '.providerProfiles.apiConfigs.bedrock.awsAccessKey'
```

Expected output: Your actual AWS access key (not `${AWS_ACCESS_KEY}`)

### Test 2: Verify All AWS Variables

```bash
node agent/config-loader.js | jq '.providerProfiles.apiConfigs.bedrock | keys[] as $k | select($k | startswith("aws")) | {($k): .[$k]}'
```

Expected output: All AWS variables with actual values

### Test 3: Run Full Validation

```bash
node agent/validate-env-vars.js
```

Expected output: "✅ All environment variables are properly resolved!"

## Integration with Cline

### Current Setup

Cline reads `roo-code-settings.json` directly. To use resolved variables:

1. **Option A (Recommended):** Create `.env` file as described above
2. **Option B:** Use a wrapper script that loads `.env` before starting
3. **Option C:** Modify Cline's MCP settings to load environment variables

### Option A: Direct `.env` Loading (Current)

```bash
# Create .env file
cp agent/.env.example agent/.env
# Edit with actual values
nano agent/.env
```

### Option B: Wrapper Script

Create `agent/load-config.sh`:

```bash
#!/bin/bash
set -a
source agent/.env
set +a
node agent/config-loader.js
```

### Option C: MCP Settings Integration

Modify Cline's MCP settings to include environment variables:

```json
{
  "mcpServers": {
    "your-server": {
      "command": "node",
      "args": ["agent/config-loader.js"],
      "env": {
        "AWS_ACCESS_KEY": "${AWS_ACCESS_KEY}",
        "AWS_SECRET_KEY": "${AWS_SECRET_KEY}"
      }
    }
  }
}
```

## Next Steps

1. ✅ Create `agent/.env` from `agent/.env.example`
2. ✅ Fill in actual credentials
3. ✅ Verify `.env` is in `.gitignore`
4. ✅ Run validation: `node agent/validate-env-vars.js`
5. ✅ Restart Cline/VSCode
6. ✅ Test API calls with resolved credentials

## Support

For issues or questions:

1. Run the validation script: `node agent/validate-env-vars.js`
2. Check the troubleshooting section above
3. Verify `.env` file exists and has values
4. Ensure `config-loader.js` is being invoked
5. Check Cline logs for error messages

## References

- [dotenv Documentation](https://github.com/motdotla/dotenv)
- [Node.js Environment Variables](https://nodejs.org/en/knowledge/file-system/how-to-use-the-os-module-to-get-environment-variables/)
- [AWS Credentials Configuration](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
- [Cline Configuration](https://github.com/cline/cline)
