# Phase 4: Cross-Project Memory Implementation Guide

**Date:** 2026-05-01  
**Status:** IMPLEMENTATION READY  
**Target Audience:** DevOps engineers, Drupal architects, infrastructure teams

---

## Overview

This guide explains how to bootstrap a new interrelated project group (e.g., AHRQ Drupal sites + infrastructure) using the cross-project memory architecture.

---

## Prerequisites

- Qdrant MCP server running and accessible
- Access to `agent/roo-code-settings.json` (or symlinked global config)
- Understanding of hierarchical naming: `{org}:{domain}:{project}`
- All projects have their own GitHub repositories

---

## Step 1: Define Your Organization & Projects

### Example: AHRQ Organization

**Organization:** `ahrq`  
**Projects:**
- `ahrq:drupal:ahrqgov` — AHRQ.gov Drupal site
- `ahrq:drupal:pso` — PSO Drupal site
- `ahrq:drupal:ehc` — EHC Drupal site
- `ahrq:terraform` — Terraform root modules
- `ahrq:infra:devops` — Core infrastructure (ECS, VPC, RDS, ALB)
- `ahrq:infra:drupal-deploy` — Drupal-specific infrastructure (ECS task defs, ECR)

### Naming Convention

```
{org}:{domain}:{project}   ← 3-segment for multi-project domains
{org}:{domain}             ← 2-segment for singleton domains

ahrq:drupal:ahrqgov        ← Multi-project domain (3 Drupal sites)
ahrq:terraform             ← Singleton domain (1 Terraform root)
ahrq:infra:devops          ← Multi-project domain (could have multiple)
ahrq:infra:drupal-deploy   ← Multi-project domain (could have multiple)
```

---

## Step 2: Create the Shared Registry Entry

The **shared:registry** namespace stores the authoritative dependency map for your organization.

### Create `.ai-memory/{ORG}_RELATIONSHIP_MAP.md`

```markdown
# {ORG} Project Relationship Map & Contracts

**Namespace:** `shared:registry`  
**Tags:** `["relationship-map", "{org}", "contracts"]`  
**Owner:** Infrastructure Team

## Projects
- {org}:drupal:* — Drupal sites
- {org}:infra:* — Infrastructure projects
- {org}:terraform — Terraform root modules

## Relationships
[Define dependency graph]

## Contracts
[Define all enforced contracts]
```

### Store in Qdrant

```bash
# Use memorize_context to store the relationship map
memorize_context(
  project="shared:registry",
  tags=["relationship-map", "{org}", "contracts"],
  content="[Full relationship map content]"
)
```

---

## Step 3: Create Project Manifests

Each project stores its own manifest in its namespace, declaring dependencies and contracts.

### Create `.ai-memory/{ORG}_PROJECT_MANIFESTS.md`

For each project, create a manifest entry:

```markdown
# Project Manifest: {org}:{domain}:{project}

## Identity
- org: {org}
- domain: {domain}
- project: {project}
- type: [drupal-site|infrastructure|tooling]
- version: X.Y.Z
- repository: https://github.com/...

## Description
[Project description]

## Dependencies
- {org}:infra:drupal-deploy  (runtime: ECS task def, ECR image tag)
- {org}:infra:devops         (runtime: VPC, RDS, ALB endpoints)
- {org}:terraform            (outputs: subnet IDs, security groups)

## Contracts I Enforce
- PHP: 8.3+
- Drupal: 10.x
- MySQL: 8.0+

## Contracts I Depend On
- PHP: 8.3+ (from {org}:infra:drupal-deploy)
- MySQL: 8.0+ (from {org}:infra:devops)

## Bootstrap Query
At UGIP init, query:
1. recall_context(project="shared:registry", query="{org}:{domain}:{project} relationships")
2. recall_context(project="{org}:infra:drupal-deploy", query="PHP version Docker image")
3. recall_context(project="{org}:infra:devops", query="VPC RDS ALB endpoints")
4. recall_context(project="{org}:terraform", query="root module outputs")
```

### Store in Qdrant

```bash
# For each project, store its manifest
memorize_context(
  project="{org}:{domain}:{project}",
  tags=["manifest", "dependencies", "contracts"],
  content="[Full manifest content]"
)
```

---

## Step 4: Update UGIP Mode Hooks

Update the global rules files to include cross-project initialization for your organization.

### For `agent/rules-drupal-builder/memory.md`

Add this section:

```markdown
## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When working on a Drupal project with infrastructure dependencies (e.g., `{org}:drupal:*`).

### Automatic Execution
At UGIP Phase 4 initialization:

1. Extract ORG from PROJECT_NAME: `{org}:drupal:ahrqgov` → `ORG = {org}`
2. Query shared:registry: `recall_context(project="shared:registry", query="${ORG} relationship map")`
3. Query dependencies:
   - `recall_context(project="${ORG}:infra:drupal-deploy", query="PHP version Docker image")`
   - `recall_context(project="${ORG}:infra:devops", query="MySQL version RDS endpoint")`
   - `recall_context(project="${ORG}:terraform", query="root module outputs")`
4. Synthesize all sources before proceeding
```

### For `agent/rules-orchestrator/memory.md`

Add this section:

```markdown
## CROSS-PROJECT INITIALIZATION (UGIP Phase 4 Enhancement)

### When to Use
When orchestrating deployments across multiple projects in an organization.

### Automatic Execution
At UGIP Phase 4 initialization:

1. Extract ORG from PROJECT_NAME
2. Query shared:registry: `recall_context(project="shared:registry", query="${ORG} all projects relationship map")`
3. Query all projects for deployment state
4. Synthesize all sources for orchestration decisions
```

---

## Step 5: Bootstrap a New Project

When starting work on a new project in your organization:

### For Drupal Projects

```bash
# 1. Clone the repository
git clone https://github.com/{org}/{project}-drupal.git
cd {project}-drupal

# 2. Open in VS Code
code .

# 3. Switch to drupal-architect mode
# → UGIP Phase 4 automatically queries:
#    - shared:registry for relationship map
#    - {org}:infra:drupal-deploy for PHP version, Docker image
#    - {org}:infra:devops for MySQL version, RDS endpoint
#    - {org}:terraform for VPC, subnet IDs

# 4. Agent has full context with all dependencies
```

### For Infrastructure Projects

```bash
# 1. Clone the repository
git clone https://github.com/{org}/terraform-{project}.git
cd terraform-{project}

# 2. Open in VS Code
code .

# 3. Switch to cloud-architect mode
# → UGIP Phase 4 automatically queries:
#    - shared:registry for relationship map
#    - {org}:terraform for root module outputs
#    - {org}:infra:devops for infrastructure state

# 4. Agent has full context with all dependencies
```

---

## Step 6: Verify Cross-Project Queries

Test that cross-project queries are working:

### Manual Test

```bash
# In any project, manually query the shared registry
recall_context(
  project="shared:registry",
  query="{org} relationship map"
)

# Should return the complete dependency graph
```

### UGIP Test

```bash
# Open a project in VS Code
# Switch to drupal-architect mode
# Check the initialization logs to verify:
# 1. ORG extraction: "Extracted ORG = {org}"
# 2. Registry query: "Querying shared:registry for {org} relationship map"
# 3. Dependency queries: "Querying {org}:infra:drupal-deploy for PHP version"
```

---

## Step 7: Maintain the Relationship Map

### When to Update

- **New project added** → Update shared:registry with new project entry
- **Dependency changes** → Update shared:registry and affected project manifests
- **Contract changes** → Update shared:registry and all affected projects
- **Version updates** → Update project manifests with new versions

### Update Process

```bash
# 1. Update the relationship map
# Edit .ai-memory/{ORG}_RELATIONSHIP_MAP.md

# 2. Store in Qdrant
memorize_context(
  project="shared:registry",
  tags=["relationship-map", "{org}", "contracts"],
  content="[Updated relationship map]"
)

# 3. Update affected project manifests
# Edit .ai-memory/{ORG}_PROJECT_MANIFESTS.md

# 4. Store updated manifests in Qdrant
memorize_context(
  project="{org}:{domain}:{project}",
  tags=["manifest", "dependencies", "contracts"],
  content="[Updated manifest]"
)

# 5. Notify all dependent projects of changes
```

---

## Troubleshooting

### Problem: Cross-project queries not executing

**Solution:**
1. Verify ORG extraction: PROJECT_NAME should be `{org}:domain:project`
2. Check shared:registry exists: `recall_context(project="shared:registry", query="test")`
3. Verify project manifests are stored: `recall_context(project="{org}:{domain}:{project}", tags=["manifest"])`

### Problem: Dependency queries returning empty results

**Solution:**
1. Verify dependency project exists in Qdrant
2. Check project manifest is stored with correct tags
3. Verify query text matches stored content

### Problem: Contracts not enforced

**Solution:**
1. Verify contracts are defined in shared:registry
2. Check project manifests declare contract dependencies
3. Verify agents are reading synthesized context

---

## Example: AHRQ Implementation

### Step 1: Define Projects ✅
```
ahrq:drupal:ahrqgov, ahrq:drupal:pso, ahrq:drupal:ehc
ahrq:terraform, ahrq:infra:devops, ahrq:infra:drupal-deploy
```

### Step 2: Create Shared Registry ✅
```
File: .ai-memory/AHRQ_RELATIONSHIP_MAP.md
Stored in: shared:registry with tags ["relationship-map", "ahrq", "contracts"]
```

### Step 3: Create Project Manifests ✅
```
File: .ai-memory/AHRQ_PROJECT_MANIFESTS.md
Stored in: Each project namespace with tags ["manifest", "dependencies", "contracts"]
```

### Step 4: Update UGIP Mode Hooks ⏳
```
Update: agent/rules-drupal-builder/memory.md
Update: agent/rules-orchestrator/memory.md
Update: agent/rules-architect/memory.md
Update: agent/rules-code/memory.md
```

### Step 5: Bootstrap Projects ⏳
```
Clone ahrq-drupal, open in VS Code, switch to drupal-architect
→ Automatic cross-project queries execute
→ Agent has full context with all dependencies
```

---

## Best Practices

1. **Naming Consistency** — Always use `{org}:{domain}:{project}` format
2. **Contract Clarity** — Define all contracts in shared:registry
3. **Manifest Updates** — Keep project manifests in sync with shared:registry
4. **Regular Reviews** — Review relationship map quarterly for accuracy
5. **Documentation** — Document all contracts and dependencies
6. **Testing** — Test cross-project queries before deploying to production

---

## Next Steps

- **Phase 5:** Testing & validation with real AHRQ projects
- **Phase 6:** Apply to all interrelated projects (PSO, EHC, etc.)
- **Phase 7:** Qdrant memory optimization
- **Phase 8:** Monitoring & observability

---

## References

- **ADR-003:** Cross-Project Memory Architecture (`.ai-memory/ADR-003-CROSS_PROJECT_MEMORY_ARCHITECTURE.md`)
- **AHRQ Relationship Map:** (`.ai-memory/AHRQ_RELATIONSHIP_MAP.md`)
- **AHRQ Project Manifests:** (`.ai-memory/AHRQ_PROJECT_MANIFESTS.md`)
- **UGIP Phase 3 Spec:** (`.ai-memory/PHASE3_UGIP_CROSS_PROJECT_HOOKS_SPEC.md`)
- **GitHub Issue #36:** Cross-Project Memory Architecture
