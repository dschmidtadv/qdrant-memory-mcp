# Clarification: Which Version to Import into Cline

## Short Answer

**YES - Import the version WITH the `${VARIABLE}` placeholders.**

The file you import into Cline should contain `${AWS_ACCESS_KEY}`, `${AWS_SECRET_KEY}`, etc. - NOT actual secret values.

## How It Works

### The Flow

```
1. You import agent/roo-code-settings.json into Cline
   ↓
   Contains: "awsAccessKey": "${AWS_ACCESS_KEY}"
   ↓
2. config-loader.js loads agent/.env
   ↓
   Reads: AWS_ACCESS_KEY=AKIAXXXXXXXXXXXXXXXX
   ↓
3. substituteEnvVars() replaces ${AWS_ACCESS_KEY} with actual value
   ↓
4. Cline receives resolved config with actual credentials
   ↓
5. API calls work with real credentials ✅
```

### What Cline Sees

**In Cline's configuration:**
```json
{
  "bedrock": {
    "awsAccessKey": "AKIAXXXXXXXXXXXXXXXX",      // ✅ Resolved at runtime
    "awsSecretKey": "xzI9ODZftr3f5iyV/b0fJ+...",  // ✅ Resolved at runtime
    "awsRegion": "us-east-1"
  }
}
```

**In the file you commit (agent/roo-code-settings.json):**
```json
{
  "bedrock": {
    "awsAccessKey": "${AWS_ACCESS_KEY}",      // ✅ Template - safe to commit
    "awsSecretKey": "${AWS_SECRET_KEY}",      // ✅ Template - safe to commit
    "awsRegion": "us-east-1"
  }
}
```

## Why This Design

### Security Benefits

1. **Safe to Commit** - Template file has no secrets
2. **No Hardcoded Credentials** - Secrets only in local `.env`
3. **Easy to Share** - Can share config without exposing secrets
4. **Environment-Specific** - Different values per environment

### Example

```
Developer A's agent/.env:
  AWS_ACCESS_KEY=AKIA...XXXX (personal key)

Developer B's agent/.env:
  AWS_ACCESS_KEY=AKIA...YYYY (personal key)

Shared agent/roo-code-settings.json:
  "awsAccessKey": "${AWS_ACCESS_KEY}"  (same for both)
```

## The Three Files

| File | Contains | Commit? | Purpose |
|------|----------|---------|---------|
| `agent/roo-code-settings.json` | `${VARIABLE}` placeholders | ✅ YES | Template for all developers |
| `agent/.env.example` | Variable names only | ✅ YES | Documentation of required variables |
| `agent/.env` | Actual secret values | ❌ NO | Your local secrets (in .gitignore) |

## What You Import into Cline

You import **`agent/roo-code-settings.json`** which contains:

```json
{
  "providerProfiles": {
    "apiConfigs": {
      "bedrock": {
        "awsAccessKey": "${AWS_ACCESS_KEY}",
        "awsSecretKey": "${AWS_SECRET_KEY}",
        "awsRegion": "${AWS_REGION}",
        "awsProfile": "${AWS_PROFILE}"
      }
    }
  }
}
```

**NOT** a version with actual secrets like:

```json
{
  "bedrock": {
    "awsAccessKey": "AKIAXXXXXXXXXXXXXXXX",  // ❌ WRONG - never do this
    "awsSecretKey": "xzI9ODZftr3f5iyV/..."   // ❌ WRONG - never do this
  }
}
```

## Verification

To verify Cline is receiving resolved values:

```bash
# Check what config-loader outputs (what Cline receives)
node agent/config-loader.js 2>/dev/null | grep -A 2 '"awsAccessKey"'

# Output should show actual values:
# "awsAccessKey": "AKIAXXXXXXXXXXXXXXXX",
# "awsSecretKey": "xzI9ODZftr3f5iyV/b0fJ+...",
```

## Summary

- ✅ **Import:** `agent/roo-code-settings.json` (with `${VARIABLE}` placeholders)
- ✅ **Cline receives:** Resolved config with actual credentials
- ✅ **Commit:** Template file (safe - no secrets)
- ✅ **Local only:** `agent/.env` (actual secrets - in .gitignore)
