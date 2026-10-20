# CRITICAL: How Cline Imports roo-code-settings.json

## The Problem

When you import `roo-code-settings.json` into Cline, it reads the file **directly as JSON** without running it through `config-loader.js`. This means:

```
❌ WRONG - What's happening now:
Cline reads: "awsAccessKey": "${AWS_ACCESS_KEY}"
Cline tries to use: "${AWS_ACCESS_KEY}" as actual value
Result: Invalid URL error ❌

✅ CORRECT - What should happen:
Cline reads: "awsAccessKey": "${AWS_ACCESS_KEY}"
config-loader.js resolves: "${AWS_ACCESS_KEY}" → "AKIAXXXXXXXXXXXXXXXX"
Cline uses: "AKIAXXXXXXXXXXXXXXXX"
Result: Works ✅
```

## The Solution: Two Approaches

### Approach 1: Pre-Resolve Before Importing (RECOMMENDED)

**Step 1: Generate resolved config**
```bash
node agent/config-loader.js > agent/roo-code-settings-resolved.json
```

**Step 2: Import the resolved version into Cline**
- Use `agent/roo-code-settings-resolved.json` (with actual values)
- NOT `agent/roo-code-settings.json` (with `${VARIABLE}` placeholders)

**Step 3: Keep template in git**
```bash
git add agent/roo-code-settings.json        # Template with ${VAR}
git add agent/.env.example                  # Documentation
# agent/.env is in .gitignore (secrets stay local)
```

### Approach 2: Modify Cline Integration

Create a wrapper that resolves variables before Cline reads the config. This requires modifying how Cline loads the configuration.

## Why This Happens

Cline's configuration import is **static** - it reads JSON files directly without executing Node.js scripts. The `config-loader.js` is designed for:

1. **Command-line usage**: `node agent/config-loader.js`
2. **Module usage**: `require('./config-loader.js').loadConfig()`
3. **Testing**: Validating that variables are resolved

But **NOT** for automatic resolution when Cline imports the file.

## Implementation

### Step 1: Generate Resolved Config

```bash
cd /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp
node agent/config-loader.js > agent/roo-code-settings-resolved.json
```

This creates a new file with all `${VARIABLE}` replaced with actual values from `agent/.env`.

### Step 2: Import Into Cline

In Cline's configuration import dialog:
- **Import from**: `agent/roo-code-settings-resolved.json`
- **NOT from**: `agent/roo-code-settings.json`

### Step 3: Update .gitignore

Add the resolved file to `.gitignore` so it's not committed:

```bash
# .gitignore
agent/roo-code-settings-resolved.json
```

### Step 4: Create Update Script

Create a script to regenerate the resolved config when `.env` changes:

```bash
#!/bin/bash
# agent/generate-resolved-config.sh

echo "Generating resolved configuration..."
node agent/config-loader.js > agent/roo-code-settings-resolved.json
echo "✅ Generated: agent/roo-code-settings-resolved.json"
echo "📝 Import this file into Cline, not roo-code-settings.json"
```

Make it executable:
```bash
chmod +x agent/generate-resolved-config.sh
```

## Workflow

### When You First Set Up

```bash
# 1. Create .env with actual values
cp agent/.env.example agent/.env
nano agent/.env  # Add actual credentials

# 2. Generate resolved config
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# 3. Import into Cline
# Use: agent/roo-code-settings-resolved.json
```

### When You Update .env

```bash
# 1. Update credentials
nano agent/.env

# 2. Regenerate resolved config
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# 3. Re-import into Cline
# Use: agent/roo-code-settings-resolved.json
```

### When You Edit roo-code-settings.json

```bash
# 1. Edit template
nano agent/roo-code-settings.json

# 2. Regenerate resolved config
node agent/config-loader.js > agent/roo-code-settings-resolved.json

# 3. Re-import into Cline
# Use: agent/roo-code-settings-resolved.json

# 4. Commit template only
git add agent/roo-code-settings.json
git add agent/.env.example
```

## Files Summary

| File | Purpose | Commit? | Import to Cline? |
|------|---------|---------|------------------|
| `agent/roo-code-settings.json` | Template with `${VAR}` | ✅ YES | ❌ NO |
| `agent/.env.example` | Variable documentation | ✅ YES | ❌ NO |
| `agent/.env` | Actual secrets | ❌ NO | ❌ NO |
| `agent/roo-code-settings-resolved.json` | Resolved config | ❌ NO | ✅ YES |

## Verification

After generating resolved config:

```bash
# Check that variables are resolved
node agent/config-loader.js | grep -A 2 '"awsAccessKey"'

# Should show actual values, not ${VARIABLE}
# "awsAccessKey": "AKIAXXXXXXXXXXXXXXXX",
```

## Why This Design

1. **Security**: Template file has no secrets (safe to commit)
2. **Flexibility**: Different values per environment
3. **Clarity**: Clear separation between template and resolved config
4. **Simplicity**: Cline just reads JSON, no script execution needed

## Key Takeaway

**Import `agent/roo-code-settings-resolved.json` into Cline, NOT `agent/roo-code-settings.json`**

The resolved file is generated from the template + your `.env` file.
