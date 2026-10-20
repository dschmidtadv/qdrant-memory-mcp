# Guide: Editing roo-code-settings.json

## ⚠️ CRITICAL: Import Process

**After editing roo-code-settings.json, you MUST:**

1. Regenerate the resolved config:
   ```bash
   node agent/config-loader.js > agent/roo-code-settings-resolved.json
   ```

2. Import the resolved file into Cline:
   ```
   agent/roo-code-settings-resolved.json
   ```

3. Restart Cline/VSCode

See [`CRITICAL_IMPORT_INSTRUCTIONS.md`](CRITICAL_IMPORT_INSTRUCTIONS.md) for details.

## Overview

`roo-code-settings.json` is the central configuration template for all Cline agent modes and API providers. When making changes, you must follow security best practices to ensure secrets are never hardcoded.

## Key Principle

**Always use `${VARIABLE_NAME}` placeholders for sensitive credentials.**

The `config-loader.js` script automatically resolves these placeholders to actual values from `agent/.env` when generating the resolved config.

## Workflow for Making Changes

### Step 1: Edit the Configuration File

```bash
nano agent/roo-code-settings.json
```

### Step 2: Use Template Variables for Secrets

✅ **CORRECT - Use placeholders:**
```json
{
  "bedrock": {
    "awsAccessKey": "${AWS_ACCESS_KEY}",
    "awsSecretKey": "${AWS_SECRET_KEY}",
    "awsRegion": "us-east-1",
    "awsProfile": "${AWS_PROFILE}"
  }
}
```

❌ **WRONG - Never hardcode secrets:**
```json
{
  "bedrock": {
    "awsAccessKey": "AKIAIOSFODNN7EXAMPLE",
    "awsSecretKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  }
}
```

### Step 3: Add Variables to `.env.example`

If you add new `${VAR}` placeholders, document them in `agent/.env.example`:

```bash
# agent/.env.example

# AWS Credentials for Bedrock
AWS_ACCESS_KEY=your-aws-access-key-here
AWS_SECRET_KEY=your-aws-secret-key-here
AWS_REGION=us-east-1
AWS_PROFILE=your-aws-profile-name

# New Feature (if adding)
NEW_FEATURE_API_KEY=your-api-key-here
NEW_FEATURE_BASE_URL=https://api.example.com
```

### Step 4: Add Actual Values to `.env`

Update `agent/.env` with actual credentials:

```bash
# agent/.env

AWS_ACCESS_KEY=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_KEY=xxxxREDACTEDxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
AWS_PROFILE=my-profile

# New Feature
NEW_FEATURE_API_KEY=actual-secret-key
NEW_FEATURE_BASE_URL=https://api.example.com
```

### Step 5: Generate Resolved Config

```bash
node agent/config-loader.js > agent/roo-code-settings-resolved.json
```

This creates a new file with all `${VARIABLE}` replaced with actual values from `agent/.env`.

### Step 6: Validate Configuration

Run the validation script to ensure all variables are resolved:

```bash
node agent/validate-env-vars.js
```

Expected output:
```
✅ All environment variables are properly resolved!
```

### Step 7: Test the Configuration

Verify the resolved config works correctly:

```bash
# View resolved configuration
node agent/config-loader.js 2>/dev/null | jq '.providerProfiles.apiConfigs.bedrock'

# Or with debug output
node agent/config-loader.js --debug 2>&1 | head -50
```

### Step 8: Import Into Cline

Import the resolved file into Cline:
- **Import**: `agent/roo-code-settings-resolved.json`
- **NOT**: `agent/roo-code-settings.json`

### Step 9: Commit Changes

Commit only the template files (secrets are in `.gitignore`):

```bash
# Stage the template files
git add agent/roo-code-settings.json
git add agent/.env.example

# Commit
git commit -m "Update roo-code-settings.json with new configuration"

# ✅ agent/.env is automatically excluded (in .gitignore)
# ✅ agent/roo-code-settings-resolved.json is automatically excluded (in .gitignore)
```

### Step 10: Restart Cline/VSCode

Restart Cline or VSCode to load the new configuration:

```bash
# Close and reopen VSCode
# Or restart Cline extension
```

## Common Scenarios

### Scenario 1: Adding a New API Provider

**1. Edit `roo-code-settings.json`:**
```json
{
  "providerProfiles": {
    "apiConfigs": {
      "myNewProvider": {
        "apiKey": "${MY_NEW_PROVIDER_API_KEY}",
        "baseUrl": "${MY_NEW_PROVIDER_BASE_URL}",
        "timeout": 30,
        "apiProvider": "custom"
      }
    }
  }
}
```

**2. Add to `agent/.env.example`:**
```bash
# My New Provider Configuration
MY_NEW_PROVIDER_API_KEY=your-api-key-here
MY_NEW_PROVIDER_BASE_URL=https://api.mynewprovider.com
```

**3. Add to `agent/.env`:**
```bash
MY_NEW_PROVIDER_API_KEY=actual-secret-key
MY_NEW_PROVIDER_BASE_URL=https://api.mynewprovider.com
```

**4. Generate and validate:**
```bash
node agent/config-loader.js > agent/roo-code-settings-resolved.json
node agent/validate-env-vars.js
```

**5. Import into Cline:**
- Use: `agent/roo-code-settings-resolved.json`

### Scenario 2: Updating Existing Credentials

**1. Edit `agent/.env`:**
```bash
# Update the actual value
AWS_ACCESS_KEY=NEW_KEY_VALUE
AWS_SECRET_KEY=NEW_SECRET_VALUE
```

**2. Regenerate resolved config:**
```bash
node agent/config-loader.js > agent/roo-code-settings-resolved.json
```

**3. Re-import into Cline:**
- Use: `agent/roo-code-settings-resolved.json`

**4. Restart Cline/VSCode**

### Scenario 3: Adding Optional Configuration

**1. Edit `roo-code-settings.json`:**
```json
{
  "optionalFeature": {
    "enabled": true,
    "apiKey": "${OPTIONAL_FEATURE_API_KEY}"
  }
}
```

**2. Add to `agent/.env.example` with comment:**
```bash
# Optional - only needed for advanced features
OPTIONAL_FEATURE_API_KEY=your-api-key-here
```

**3. Add to `agent/.env`:**
```bash
# Optional - only needed for advanced features
OPTIONAL_FEATURE_API_KEY=actual-key-or-empty
```

**4. Generate and validate:**
```bash
node agent/config-loader.js > agent/roo-code-settings-resolved.json
node agent/validate-env-vars.js
```

## Variable Naming Conventions

Use clear, descriptive names for environment variables:

```bash
# ✅ GOOD - Clear and descriptive
AWS_ACCESS_KEY
AWS_SECRET_KEY
GEMINI_API_KEY
LITELLM_BASE_URL
LITELLM_API_KEY

# ❌ AVOID - Vague or unclear
KEY
SECRET
API_KEY (too generic)
URL (too generic)
```

## Security Checklist

Before committing changes:

- [ ] All secrets use `${VARIABLE_NAME}` placeholders
- [ ] No hardcoded credentials in `roo-code-settings.json`
- [ ] New variables documented in `agent/.env.example`
- [ ] Actual values added to `agent/.env`
- [ ] `agent/.env` is in `.gitignore`
- [ ] Resolved config generated: `node agent/config-loader.js > agent/roo-code-settings-resolved.json`
- [ ] Validation passes: `node agent/validate-env-vars.js`
- [ ] Configuration tested: `node agent/config-loader.js --debug`
- [ ] Only template files committed (not `.env` or resolved config)
- [ ] Resolved config imported into Cline

## Troubleshooting

### Issue: Validation shows unresolved variables

```bash
# Check if variable is in .env
grep "VARIABLE_NAME" agent/.env

# Check if variable is in roo-code-settings.json
grep "VARIABLE_NAME" agent/roo-code-settings.json

# Run validation with debug output
node agent/config-loader.js --debug 2>&1 | grep "VARIABLE_NAME"
```

### Issue: Changes not taking effect in Cline

1. Verify `.env` file has the correct values
2. Regenerate resolved config: `node agent/config-loader.js > agent/roo-code-settings-resolved.json`
3. Re-import into Cline: `agent/roo-code-settings-resolved.json`
4. Restart Cline/VSCode completely
5. Check Cline logs for errors

### Issue: "Cannot find module 'dotenv'"

```bash
cd agent && npm install dotenv
```

## File Locations

| File | Purpose | Commit? |
|------|---------|---------|
| `agent/roo-code-settings.json` | Configuration template | ✅ YES |
| `agent/.env.example` | Variable documentation | ✅ YES |
| `agent/.env` | Actual secrets | ❌ NO (in .gitignore) |
| `agent/config-loader.js` | Variable resolver | ✅ YES |
| `agent/validate-env-vars.js` | Validation script | ✅ YES |
| `agent/roo-code-settings-resolved.json` | Resolved config | ❌ NO (in .gitignore) |

## Quick Reference

```bash
# Edit configuration
nano agent/roo-code-settings.json

# Edit environment variables
nano agent/.env

# Generate resolved config
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# Validate changes
node agent/validate-env-vars.js

# Test configuration
node agent/config-loader.js --debug

# View resolved config
node agent/config-loader.js 2>/dev/null | jq '.'

# Commit changes
git add agent/roo-code-settings.json agent/.env.example
git commit -m "Update configuration"
```

## Key Rules

✅ **DO:**
- Use `${VARIABLE_NAME}` for all secrets
- Keep `.env` file local (in `.gitignore`)
- Document variables in `.env.example`
- Generate resolved config after changes
- Run validation after changes
- Commit template files, not secrets
- Import resolved config into Cline
- Restart Cline after changes

❌ **DON'T:**
- Hardcode secrets in JSON
- Commit `.env` file
- Commit resolved config file
- Use unresolved variables in production
- Share `.env` files
- Log environment variables
- Import template file into Cline
