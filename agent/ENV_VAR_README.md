# Environment Variable Resolution for roo-code-settings.json

## ⚠️ CRITICAL: How to Import Into Cline

**Import THIS file into Cline:**
```
agent/roo-code-settings-resolved.json
```

**NOT this file:**
```
agent/roo-code-settings.json  ❌ (has ${VARIABLE} placeholders)
```

**Why?** Cline reads JSON files directly without running scripts. The resolved file has actual credentials, not templates.

See [`CRITICAL_IMPORT_INSTRUCTIONS.md`](CRITICAL_IMPORT_INSTRUCTIONS.md) for full details.

## Quick Start

```bash
# 1. Run the setup script
bash agent/setup-env.sh

# 2. Edit the .env file with your credentials
nano agent/.env

# 3. Validate the setup
node agent/validate-env-vars.js

# 4. Generate resolved config for Cline
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# 5. Import agent/roo-code-settings-resolved.json into Cline

# 6. Restart Cline/VSCode
```

## The Problem

When you import `roo-code-settings.json` into Cline, environment variables like `${AWS_ACCESS_KEY}` are **NOT automatically resolved**. They remain as literal strings, causing "Invalid URL" errors.

### Why?

- Cline reads JSON files directly as static content
- It does NOT execute Node.js scripts
- The `config-loader.js` script is never invoked
- Variables stay as `${VAR}` template strings

## The Solution

Generate a **resolved config file** with actual values and import THAT into Cline instead.

### How It Works

```
agent/.env (your secrets)
    ↓
node agent/config-loader.js
    ↓
agent/roo-code-settings-resolved.json (actual values)
    ↓
Import into Cline ✅
```

## Files

| File | Contains | Commit? | Import to Cline? |
|------|----------|---------|------------------|
| `agent/roo-code-settings.json` | `${VARIABLE}` placeholders | ✅ YES | ❌ NO |
| `agent/.env.example` | Variable names (documentation) | ✅ YES | ❌ NO |
| `agent/.env` | Actual secret values | ❌ NO | ❌ NO |
| `agent/roo-code-settings-resolved.json` | **Actual values** | ❌ NO | ✅ **YES** |

## Workflow

### Initial Setup

```bash
# 1. Create .env from template
cp agent/.env.example agent/.env

# 2. Edit with actual credentials
nano agent/.env

# 3. Generate resolved config
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# 4. Import into Cline
# Use: agent/roo-code-settings-resolved.json
```

### When You Update .env

```bash
# 1. Edit credentials
nano agent/.env

# 2. Regenerate resolved config
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# 3. Re-import into Cline
```

### When You Edit roo-code-settings.json

```bash
# 1. Edit template
nano agent/roo-code-settings.json

# 2. Regenerate resolved config
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# 3. Re-import into Cline

# 4. Commit template only
git add agent/roo-code-settings.json
git add agent/.env.example
```

## Verification

Check that variables are resolved:

```bash
# View resolved config
node agent/config-loader.js 2>/dev/null | grep -A 2 '"awsAccessKey"'

# Should show actual values:
# "awsAccessKey": "AKIAXXXXXXXXXXXXXXXX",
# "awsSecretKey": "xzI9ODZftr3f5iyV/b0fJ+...",
```

## Tools

### Setup Script
```bash
bash agent/setup-env.sh
```
Automatically creates `.env`, adds to `.gitignore`, installs dotenv.

### Validation Script
```bash
node agent/validate-env-vars.js
```
Checks that all variables are properly resolved.

### Config Loader
```bash
# Generate resolved config
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# View with debug output
node agent/config-loader.js --debug 2>&1 | head -50

# Validate only
node agent/config-loader.js --validate
```

## Troubleshooting

### Issue: "Invalid URL" error in Cline

**Solution:** You imported `roo-code-settings.json` instead of `roo-code-settings-resolved.json`

```bash
# Generate resolved config
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# Import THIS file into Cline
```

### Issue: Variables still show as `${VAR}`

**Solution:** Regenerate the resolved config

```bash
# Verify .env has values
cat agent/.env | grep AWS_ACCESS_KEY

# Regenerate
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# Check result
grep "awsAccessKey" agent/roo-code-settings-resolved.json
```

### Issue: "Cannot find module 'dotenv'"

**Solution:** Install dotenv

```bash
cd agent && npm install dotenv
```

## Security

✅ **Best Practices:**
- Template file (`roo-code-settings.json`) has no secrets - safe to commit
- Resolved file (`roo-code-settings-resolved.json`) has secrets - NOT committed
- `.env` file has actual secrets - NOT committed (in `.gitignore`)

❌ **Never:**
- Commit `.env` file
- Commit `roo-code-settings-resolved.json`
- Hardcode secrets in `roo-code-settings.json`
- Share `.env` files

## Documentation

- **[`CRITICAL_IMPORT_INSTRUCTIONS.md`](CRITICAL_IMPORT_INSTRUCTIONS.md)** - Why and how to import resolved config
- **[`EDITING_GUIDE.md`](EDITING_GUIDE.md)** - How to edit roo-code-settings.json
- **[`ENV_SETUP_GUIDE.md`](ENV_SETUP_GUIDE.md)** - Detailed setup instructions
- **[`CLARIFICATION_IMPORT_VERSION.md`](CLARIFICATION_IMPORT_VERSION.md)** - Which version to import

## Key Takeaway

**Import `agent/roo-code-settings-resolved.json` into Cline, NOT `agent/roo-code-settings.json`**

The resolved file is generated from the template + your `.env` file and contains actual credentials.
