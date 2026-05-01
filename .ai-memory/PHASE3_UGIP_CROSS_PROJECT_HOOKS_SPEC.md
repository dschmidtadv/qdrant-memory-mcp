# Phase 3: UGIP Cross-Project Initialization Implementation Spec

**Date:** 2026-05-01  
**Status:** READY FOR IMPLEMENTATION  
**Target Files:** 4 global rules files + 1 spec document

---

## Overview

Phase 3 enhances UGIP Phase 4 (Mode-Specific Initialization) to automatically query cross-project dependencies. The enhancement adds three new steps to the existing mode-specific query:

1. **Extract ORG** from PROJECT_NAME (e.g., `ahrq:drupal:ahrqgov` → `ahrq`)
2. **Query shared:registry** for relationship map and dependencies
3. **Query each dependency** for runtime requirements and contracts

---

## ORG Extraction Logic

```
PROJECT_NAME format: {org}:{domain}:{project}  OR  {org}:{domain}
ORG = first segment before first colon

Examples:
  ahrq:drupal:ahrqgov → ORG = ahrq
  ahrq:infra:devops   → ORG = ahrq
  riva:qdrant         → ORG = riva
  internal:qdrant-memory-mcp → ORG = internal (skip cross-project)
  shared:registry     → ORG = shared (skip cross-project)
```

**Skip cross-project queries if:** `ORG ∈ {internal, shared, riva, platform}`

---

## Cross-Project Initialization Section Template

Add this section to each global rules file. Customize the queries per mode.

```markdown
## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When working on a project with dependencies (e.g., `ahrq:drupal:ahrqgov` depends on `ahrq:infra:drupal-deploy`).

### Automatic Execution
At UGIP Phase 4 initialization, after the standard mode-specific query:

1. **Extract ORG** from PROJECT_NAME
   - Format: `{org}:{domain}:{project}` or `{org}:{domain}`
   - Example: `ahrq:drupal:ahrqgov` → `ORG = ahrq`
   - Skip if ORG ∈ {internal, shared, riva, platform}

2. **Query shared:registry** for relationship map
   ```
   recall_context(
     project="shared:registry",
     query="${ORG} relationship map dependencies for ${PROJECT_NAME}"
   )
   ```
   - Returns: List of dependent projects and their contracts

3. **Query each dependency** for runtime requirements
   ```
   For each dependency in relationship map:
     recall_context(
       project=dependency,
       query="[MODE-SPECIFIC DEPENDENCY QUERY]"
     )
   ```

4. **Synthesize all sources**
   - Combine resident cache + mode-specific query + registry + all dependencies
   - Use synthesized context for all subsequent work

### Mode-Specific Dependency Queries

**[MODE_NAME]:**
```
[DEPENDENCY_QUERY_TEXT]
```

---
```

---

## Mode-Specific Implementations

### 1. `agent/rules-architect/memory.md`

**Add after existing content:**

```markdown
## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When working on a project with infrastructure dependencies (e.g., `ahrq:drupal:ahrqgov` depends on `ahrq:infra:drupal-deploy`).

### Automatic Execution
At UGIP Phase 4 initialization, after the standard mode-specific query:

1. **Extract ORG** from PROJECT_NAME
   - Format: `{org}:{domain}:{project}` or `{org}:{domain}`
   - Example: `ahrq:drupal:ahrqgov` → `ORG = ahrq`
   - Skip if ORG ∈ {internal, shared, riva, platform}

2. **Query shared:registry** for relationship map
   ```
   recall_context(
     project="shared:registry",
     query="${ORG} relationship map dependencies for ${PROJECT_NAME}"
   )
   ```

3. **Query infrastructure dependencies** for architecture context
   ```
   recall_context(
     project="${ORG}:infra:drupal-deploy",
     query="PHP version Docker image ECS task def architecture"
   )
   recall_context(
     project="${ORG}:terraform",
     query="root module outputs VPC RDS endpoints architecture"
   )
   ```

4. **Synthesize all sources**
   - Combine resident cache + mode-specific query + registry + infrastructure context
   - Use synthesized context for architectural decisions

### Example: ahrq:drupal:ahrqgov

When working on `ahrq:drupal:ahrqgov`, the architect automatically queries:
- `shared:registry` → Discover that ahrq:drupal:ahrqgov depends on ahrq:infra:drupal-deploy and ahrq:terraform
- `ahrq:infra:drupal-deploy` → Get PHP version, Docker image, ECS task def
- `ahrq:terraform` → Get VPC, RDS, security group architecture

This ensures architectural decisions account for infrastructure constraints.
```

---

### 2. `agent/rules-drupal-builder/memory.md`

**Add after existing content:**

```markdown
## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When working on a Drupal project with infrastructure dependencies (e.g., `ahrq:drupal:ahrqgov`).

### Automatic Execution
At UGIP Phase 4 initialization, after the standard mode-specific query:

1. **Extract ORG** from PROJECT_NAME
   - Format: `{org}:{domain}:{project}` or `{org}:{domain}`
   - Example: `ahrq:drupal:ahrqgov` → `ORG = ahrq`
   - Skip if ORG ∈ {internal, shared, riva, platform}

2. **Query shared:registry** for relationship map
   ```
   recall_context(
     project="shared:registry",
     query="${ORG} relationship map dependencies for ${PROJECT_NAME}"
   )
   ```

3. **Query infrastructure dependencies** for runtime requirements
   ```
   recall_context(
     project="${ORG}:infra:drupal-deploy",
     query="PHP version Docker image ECS task def runtime requirements"
   )
   recall_context(
     project="${ORG}:infra:devops",
     query="MySQL version RDS endpoint VPC security groups"
   )
   recall_context(
     project="${ORG}:terraform",
     query="root module outputs subnet IDs RDS endpoint"
   )
   ```

4. **Synthesize all sources**
   - Combine resident cache + mode-specific query + registry + infrastructure context
   - Use synthesized context for Drupal development

### Example: ahrq:drupal:ahrqgov

When working on `ahrq:drupal:ahrqgov`, the builder automatically queries:
- `shared:registry` → Discover dependencies
- `ahrq:infra:drupal-deploy` → Get PHP 8.3+, Docker image tag, ECS task def
- `ahrq:infra:devops` → Get MySQL 8.0+, RDS endpoint, security groups
- `ahrq:terraform` → Get VPC, subnet, RDS endpoint

This ensures Drupal code respects infrastructure constraints (PHP version, MySQL version, etc.).
```

---

### 3. `agent/rules-orchestrator/memory.md`

**Add after existing content:**

```markdown
## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When orchestrating deployments across multiple projects (e.g., coordinating Drupal + infrastructure updates).

### Automatic Execution
At UGIP Phase 4 initialization, after the standard mode-specific query:

1. **Extract ORG** from PROJECT_NAME
   - Format: `{org}:{domain}:{project}` or `{org}:{domain}`
   - Example: `ahrq:drupal:ahrqgov` → `ORG = ahrq`
   - Skip if ORG ∈ {internal, shared, riva, platform}

2. **Query shared:registry** for complete relationship map
   ```
   recall_context(
     project="shared:registry",
     query="${ORG} all projects relationship map dependencies contracts"
   )
   ```

3. **Query all projects** for deployment state
   ```
   recall_context(
     project="${ORG}:drupal:ahrqgov",
     query="deployment state version requirements"
   )
   recall_context(
     project="${ORG}:infra:drupal-deploy",
     query="deployment configuration ECS task def"
   )
   recall_context(
     project="${ORG}:infra:devops",
     query="infrastructure state VPC RDS ALB"
   )
   recall_context(
     project="${ORG}:terraform",
     query="root module state outputs"
   )
   ```

4. **Synthesize all sources**
   - Combine resident cache + mode-specific query + registry + all project states
   - Use synthesized context for orchestration decisions

### Example: AHRQ Organization

When orchestrating AHRQ deployments, the orchestrator automatically queries:
- `shared:registry` → Get complete dependency graph and contracts
- `ahrq:drupal:ahrqgov`, `ahrq:drupal:pso`, `ahrq:drupal:ehc` → Get Drupal deployment state
- `ahrq:infra:drupal-deploy` → Get ECS task def, ECR image
- `ahrq:infra:devops` → Get infrastructure state
- `ahrq:terraform` → Get root module state

This ensures orchestration decisions account for all project dependencies and contracts.
```

---

### 4. `agent/rules-code/memory.md`

**Add after existing content:**

```markdown
## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When writing code that depends on infrastructure or other projects (e.g., Drupal code that depends on PHP version from infrastructure).

### Automatic Execution
At UGIP Phase 4 initialization, after the standard mode-specific query:

1. **Extract ORG** from PROJECT_NAME
   - Format: `{org}:{domain}:{project}` or `{org}:{domain}`
   - Example: `ahrq:drupal:ahrqgov` → `ORG = ahrq`
   - Skip if ORG ∈ {internal, shared, riva, platform}

2. **Query shared:registry** for relationship map
   ```
   recall_context(
     project="shared:registry",
     query="${ORG} relationship map dependencies contracts"
   )
   ```

3. **Query dependencies** for code requirements
   ```
   recall_context(
     project="${ORG}:infra:drupal-deploy",
     query="PHP version Docker image runtime requirements"
   )
   recall_context(
     project="${ORG}:infra:devops",
     query="MySQL version RDS endpoint environment variables"
   )
   ```

4. **Synthesize all sources**
   - Combine resident cache + mode-specific query + registry + dependency requirements
   - Use synthesized context for code decisions

### Example: ahrq:drupal:ahrqgov

When writing code for `ahrq:drupal:ahrqgov`, the code mode automatically queries:
- `shared:registry` → Discover dependencies
- `ahrq:infra:drupal-deploy` → Get PHP 8.3+, Docker image tag
- `ahrq:infra:devops` → Get MySQL 8.0+, RDS endpoint

This ensures code respects infrastructure constraints before implementation.
```

---

## Files to Update

| File | Section | Action |
|------|---------|--------|
| `agent/rules-architect/memory.md` | End of file | Add CROSS-PROJECT INITIALIZATION section |
| `agent/rules-drupal-builder/memory.md` | End of file | Add CROSS-PROJECT INITIALIZATION section |
| `agent/rules-orchestrator/memory.md` | End of file | Add CROSS-PROJECT INITIALIZATION section |
| `agent/rules-code/memory.md` | End of file | Add CROSS-PROJECT INITIALIZATION section |

---

## Verification Checklist

After updating all 4 files:

- [ ] Each file has a CROSS-PROJECT INITIALIZATION section
- [ ] ORG extraction logic is documented
- [ ] Mode-specific dependency queries are defined
- [ ] Example scenarios are provided
- [ ] All files are committed to feature branch
- [ ] All files are pushed to remote

---

## Next Steps

After Phase 3 implementation:

**Phase 4:** Implementation Guide
- Create `.ai-memory/CROSS_PROJECT_MEMORY_IMPLEMENTATION.md`
- Document how to bootstrap a new interrelated project group
- Provide examples for AHRQ (Drupal + DevOps + Terraform)

**Phase 5:** Testing & Validation
- Test cross-project recall with ahrq:drupal:ahrqgov
- Verify shared:registry queries work
- Validate UGIP Phase 4 enhancement

**Phase 6:** Apply to Existing Projects
- Apply to all AHRQ projects
- Apply to RIVA projects
- Document lessons learned
