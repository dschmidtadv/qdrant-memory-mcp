# Project Name Configuration via .env File

**Date:** 2026-05-01  
**Status:** READY TO USE  
**Purpose:** Set PROJECT_NAME in .env file instead of ROO_CODE_CONTEXT.md

---

## Overview

Instead of manually editing `.ai-memory/ROO_CODE_CONTEXT.md`, you can now set your project name in a `.env` file at the repository root.

---

## Step 1: Create .env File in Repository Root

In your AHRQ repository root, create a `.env` file:

```bash
# For ahrq:drupal:ahrqgov repository
cat > .env << 'EOF'
PROJECT_NAME=ahrq:drupal:ahrqgov
ORG=ahrq
DOMAIN=drupal
PROJECT=ahrqgov
EOF
```

### Example .env Files

**For ahrq:drupal:ahrqgov:**
```env
PROJECT_NAME=ahrq:drupal:ahrqgov
ORG=ahrq
DOMAIN=drupal
PROJECT=ahrqgov
```

**For ahrq:drupal:pso:**
```env
PROJECT_NAME=ahrq:drupal:pso
ORG=ahrq
DOMAIN=drupal
PROJECT=pso
```

**For ahrq:drupal:ehc:**
```env
PROJECT_NAME=ahrq:drupal:ehc
ORG=ahrq
DOMAIN=drupal
PROJECT=ehc
```

**For ahrq:infra:devops:**
```env
PROJECT_NAME=ahrq:infra:devops
ORG=ahrq
DOMAIN=infra
PROJECT=devops
```

**For ahrq:infra:drupal-deploy:**
```env
PROJECT_NAME=ahrq:infra:drupal-deploy
ORG=ahrq
DOMAIN=infra
PROJECT=drupal-deploy
```

**For ahrq:terraform:**
```env
PROJECT_NAME=ahrq:terraform
ORG=ahrq
DOMAIN=terraform
PROJECT=root
```

---

## Step 2: Add .env to .gitignore

Add `.env` to your `.gitignore` so it's not committed to the repository:

```bash
echo ".env" >> .gitignore
```

This allows each developer to have their own `.env` file without conflicts.

---

## Step 3: How the System Reads .env

When you open the project in VS Code with Roo Cline:

1. **System checks for .env file** in repository root
2. **If .env exists**, reads `PROJECT_NAME` variable
3. **If .env doesn't exist**, falls back to workspace directory basename
4. **Uses PROJECT_NAME** for all cross-project queries

### Example Flow

```
Repository: /path/to/ahrq-drupal-ahrqgov
.env file exists with: PROJECT_NAME=ahrq:drupal:ahrqgov

System reads:
  PROJECT_NAME = "ahrq:drupal:ahrqgov"
  ORG = "ahrq"
  
UGIP Phase 4 executes:
  1. Extract ORG = "ahrq"
  2. Query shared:registry for ahrq relationship map
  3. Query ahrq:infra:drupal-deploy for PHP version
  4. Query ahrq:infra:devops for MySQL version
  5. Query ahrq:terraform for VPC outputs
  6. Synthesize all sources
```

---

## Step 4: Optional Environment Variables

You can also set additional environment variables in .env:

```env
# Project identification
PROJECT_NAME=ahrq:drupal:ahrqgov
ORG=ahrq
DOMAIN=drupal
PROJECT=ahrqgov

# Qdrant configuration
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=agent-memory

# Embedding configuration
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSION=768

# Development settings
DEBUG=false
LOG_LEVEL=info
```

---

## Complete Setup for AHRQ Repository

### 1. Clone Repository
```bash
git clone https://github.com/ahrq/ahrqgov-drupal.git
cd ahrqgov-drupal
```

### 2. Create .env File
```bash
cat > .env << 'EOF'
PROJECT_NAME=ahrq:drupal:ahrqgov
ORG=ahrq
DOMAIN=drupal
PROJECT=ahrqgov
EOF
```

### 3. Add to .gitignore
```bash
echo ".env" >> .gitignore
```

### 4. Open in VS Code
```bash
code .
```

### 5. Switch to Appropriate Mode
- For Drupal: Select "Drupal Architect" or "Drupal Builder"
- For Infrastructure: Select "Cloud Architect" or "DevOps Engineer"

### 6. UGIP Phase 4 Automatically Executes
- Reads PROJECT_NAME from .env
- Queries shared:registry
- Queries all dependencies
- Synthesizes full context

---

## Troubleshooting

### Problem: .env file not being read

**Solution:** Verify file location and format:
```bash
# Check .env exists in repository root
ls -la .env

# Check format (no spaces around =)
cat .env
# Should show:
# PROJECT_NAME=ahrq:drupal:ahrqgov
# Not: PROJECT_NAME = ahrq:drupal:ahrqgov
```

### Problem: PROJECT_NAME not recognized

**Solution:** Verify .env syntax:
```bash
# Correct format
PROJECT_NAME=ahrq:drupal:ahrqgov

# Incorrect formats
PROJECT_NAME = ahrq:drupal:ahrqgov  # Spaces around =
PROJECT_NAME="ahrq:drupal:ahrqgov"  # Quotes
PROJECT_NAME='ahrq:drupal:ahrqgov'  # Quotes
```

### Problem: Cross-project queries not executing

**Solution:** Verify ORG is correctly extracted:
```bash
# Check .env has ORG variable
grep ORG .env

# Should show:
# ORG=ahrq
```

---

## .env Template for AHRQ Projects

Copy this template to each AHRQ repository:

```env
# ============================================
# Project Identification
# ============================================
# Format: {org}:{domain}:{project}
PROJECT_NAME=ahrq:drupal:ahrqgov
ORG=ahrq
DOMAIN=drupal
PROJECT=ahrqgov

# ============================================
# Qdrant Configuration
# ============================================
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=agent-memory

# ============================================
# Embedding Configuration
# ============================================
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSION=768

# ============================================
# Development Settings
# ============================================
DEBUG=false
LOG_LEVEL=info
```

---

## How to Use in Each AHRQ Project

### ahrq:drupal:ahrqgov
```env
PROJECT_NAME=ahrq:drupal:ahrqgov
ORG=ahrq
DOMAIN=drupal
PROJECT=ahrqgov
```

### ahrq:drupal:pso
```env
PROJECT_NAME=ahrq:drupal:pso
ORG=ahrq
DOMAIN=drupal
PROJECT=pso
```

### ahrq:drupal:ehc
```env
PROJECT_NAME=ahrq:drupal:ehc
ORG=ahrq
DOMAIN=drupal
PROJECT=ehc
```

### ahrq:infra:devops
```env
PROJECT_NAME=ahrq:infra:devops
ORG=ahrq
DOMAIN=infra
PROJECT=devops
```

### ahrq:infra:drupal-deploy
```env
PROJECT_NAME=ahrq:infra:drupal-deploy
ORG=ahrq
DOMAIN=infra
PROJECT=drupal-deploy
```

### ahrq:terraform
```env
PROJECT_NAME=ahrq:terraform
ORG=ahrq
DOMAIN=terraform
PROJECT=root
```

---

## Benefits of .env Configuration

✅ **No manual editing** of ROO_CODE_CONTEXT.md  
✅ **Per-repository configuration** — each repo has its own .env  
✅ **Not committed to git** — .env in .gitignore  
✅ **Easy to update** — just edit .env file  
✅ **Supports multiple environments** — dev, staging, production  
✅ **Standard practice** — follows .env convention  

---

## References

- **Quick Start Guide:** [`QUICK_START_AHRQ_REPOS.md`](.ai-memory/QUICK_START_AHRQ_REPOS.md)
- **Implementation Guide:** [`CROSS_PROJECT_MEMORY_IMPLEMENTATION_GUIDE.md`](.ai-memory/CROSS_PROJECT_MEMORY_IMPLEMENTATION_GUIDE.md)
- **AHRQ Relationship Map:** [`AHRQ_RELATIONSHIP_MAP.md`](.ai-memory/AHRQ_RELATIONSHIP_MAP.md)
