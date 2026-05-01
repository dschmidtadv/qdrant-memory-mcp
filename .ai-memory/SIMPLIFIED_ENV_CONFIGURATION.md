# Simplified .env Configuration for PROJECT_NAME

**Date:** 2026-05-01  
**Status:** SIMPLIFIED APPROACH  
**Purpose:** Minimal .env configuration with only PROJECT_NAME

---

## Why You Only Need PROJECT_NAME

You're absolutely correct! Everything is contained in the hierarchical PROJECT_NAME format: `{org}:{domain}:{project}`

The system can automatically extract:
- **ORG** from first segment: `ahrq:drupal:ahrqgov` → `ahrq`
- **DOMAIN** from second segment: `ahrq:drupal:ahrqgov` → `drupal`
- **PROJECT** from third segment: `ahrq:drupal:ahrqgov` → `ahrqgov`

---

## Simplified .env File

You only need **one line** in your .env file:

```env
PROJECT_NAME=ahrq:drupal:ahrqgov
```

That's it! The system automatically extracts ORG, DOMAIN, and PROJECT from this single value.

---

## .env Templates for All AHRQ Projects

### ahrq:drupal:ahrqgov
```env
PROJECT_NAME=ahrq:drupal:ahrqgov
```

### ahrq:drupal:pso
```env
PROJECT_NAME=ahrq:drupal:pso
```

### ahrq:drupal:ehc
```env
PROJECT_NAME=ahrq:drupal:ehc
```

### ahrq:infra:devops
```env
PROJECT_NAME=ahrq:infra:devops
```

### ahrq:infra:drupal-deploy
```env
PROJECT_NAME=ahrq:infra:drupal-deploy
```

### ahrq:terraform
```env
PROJECT_NAME=ahrq:terraform
```

---

## Complete Setup (Simplified)

### 1. Clone Repository
```bash
git clone https://github.com/ahrq/ahrqgov-drupal.git
cd ahrqgov-drupal
```

### 2. Create .env File (One Line!)
```bash
echo "PROJECT_NAME=ahrq:drupal:ahrqgov" > .env
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
- UGIP Phase 4 automatically executes
- System extracts ORG = "ahrq"
- Queries shared:registry
- Queries all dependencies
- Synthesizes full context

---

## Why the Extra Fields Were Suggested

The additional fields (ORG, DOMAIN, PROJECT) were optional for:
- **Clarity** — Makes it explicit what each part means
- **Debugging** — Easier to see if extraction failed
- **Flexibility** — Allows overriding individual components if needed

But they're **not required** — the system automatically extracts them from PROJECT_NAME.

---

## Recommendation

Use the **simplified approach** with only PROJECT_NAME:

```env
PROJECT_NAME=ahrq:drupal:ahrqgov
```

This is:
- ✅ Minimal and clean
- ✅ No redundancy
- ✅ Easier to maintain
- ✅ Follows DRY principle (Don't Repeat Yourself)
- ✅ Everything needed is in one value

---

## References

- **Quick Start Guide:** [`QUICK_START_AHRQ_REPOS.md`](.ai-memory/QUICK_START_AHRQ_REPOS.md)
- **Full .env Guide:** [`ENV_FILE_PROJECT_NAME_CONFIGURATION.md`](.ai-memory/ENV_FILE_PROJECT_NAME_CONFIGURATION.md)
