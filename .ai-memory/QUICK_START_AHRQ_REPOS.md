# Quick Start: Using Cross-Project Memory in AHRQ Repositories

**Date:** 2026-05-01  
**Status:** READY TO USE  
**Target:** Any AHRQ project repository

---

## What You Need to Do

To start using the cross-project memory architecture in other AHRQ repositories, follow these 3 simple steps:

---

## Step 1: Ensure Your Project Follows Naming Convention

Your project must use the hierarchical naming format: `{org}:{domain}:{project}`

### Examples

✅ **Correct naming:**
- `ahrq:drupal:ahrqgov` — AHRQ.gov Drupal site
- `ahrq:drupal:pso` — PSO Drupal site
- `ahrq:drupal:ehc` — EHC Drupal site
- `ahrq:infra:devops` — DevOps infrastructure
- `ahrq:infra:drupal-deploy` — Drupal deployment infrastructure
- `ahrq:terraform` — Terraform root modules

❌ **Incorrect naming:**
- `ahrqgov-drupal` — Missing org and domain
- `drupal-ahrqgov` — Wrong order
- `ahrq_drupal_ahrqgov` — Using underscores instead of colons

### How to Set Your Project Name

The project name is automatically detected from your workspace directory basename:

```
Workspace: /path/to/ahrq-drupal-ahrqgov
PROJECT_NAME = "ahrq-drupal-ahrqgov"

But we need: ahrq:drupal:ahrqgov
```

**Solution:** Create a `.env` file in your repository root with the correct PROJECT_NAME:

```bash
# Create .env file
cat > .env << 'EOF'
PROJECT_NAME=ahrq:drupal:ahrqgov
ORG=ahrq
DOMAIN=drupal
PROJECT=ahrqgov
EOF

# Add to .gitignore
echo ".env" >> .gitignore
```

**Alternative:** If you prefer not to use .env, you can manually set it in your `.ai-memory/ROO_CODE_CONTEXT.md` file.

**See also:** [`ENV_FILE_PROJECT_NAME_CONFIGURATION.md`](ENV_FILE_PROJECT_NAME_CONFIGURATION.md) for complete .env setup guide and templates for all AHRQ projects.

---

## Step 2: Verify Qdrant Connection

The cross-project memory system uses Qdrant to store and retrieve project information. Verify it's running:

```bash
# Check if Qdrant is running
curl http://localhost:6333/collections/agent-memory

# Expected response:
# {
#   "result": {
#     "name": "agent-memory",
#     "status": "green",
#     "vectors_count": 6,
#     "points_count": 6
#   }
# }
```

If Qdrant is not running, start it:

```bash
# Using Docker Compose
cd /path/to/qdrant-memory-mcp
docker-compose up -d qdrant ollama

# Verify it's running
docker ps | grep qdrant
```

---

## Step 3: Use the Project in VS Code

Once your project is set up with the correct naming convention and Qdrant is running:

### For Drupal Projects (ahrq:drupal:*)

1. **Clone your repository:**
   ```bash
   git clone https://github.com/ahrq/ahrqgov-drupal.git
   cd ahrqgov-drupal
   ```

2. **Open in VS Code:**
   ```bash
   code .
   ```

3. **Switch to drupal-architect mode:**
   - Click the mode selector in Roo Cline
   - Select "Drupal Architect"

4. **UGIP Phase 4 automatically executes:**
   - Extracts ORG = "ahrq"
   - Queries shared:registry for relationship map
   - Queries ahrq:infra:drupal-deploy for PHP version, Docker image
   - Queries ahrq:infra:devops for MySQL version, RDS endpoint
   - Queries ahrq:terraform for VPC, subnet IDs
   - Synthesizes all sources into full context

5. **You now have full cross-project context!**

### For Infrastructure Projects (ahrq:infra:*)

1. **Clone your repository:**
   ```bash
   git clone https://github.com/ahrq/terraform-devops.git
   cd terraform-devops
   ```

2. **Open in VS Code:**
   ```bash
   code .
   ```

3. **Switch to cloud-architect mode:**
   - Click the mode selector in Roo Cline
   - Select "Cloud Architect"

4. **UGIP Phase 4 automatically executes:**
   - Extracts ORG = "ahrq"
   - Queries shared:registry for relationship map
   - Queries ahrq:terraform for root module outputs
   - Queries ahrq:infra:devops for infrastructure state
   - Synthesizes all sources into full context

5. **You now have full cross-project context!**

---

## What Happens Automatically

When you open any AHRQ project and switch to a mode (drupal-architect, cloud-architect, devops-engineer, orchestrator, code), the system automatically:

### 1. Extracts Organization
```
PROJECT_NAME: ahrq:drupal:ahrqgov
ORG: ahrq
```

### 2. Queries Shared Registry
```
recall_context(
  project="shared:registry",
  query="ahrq relationship map"
)
```
Returns: Complete AHRQ dependency graph with all 6 projects

### 3. Queries Dependencies
```
recall_context(project="ahrq:infra:drupal-deploy", query="PHP version Docker image")
recall_context(project="ahrq:infra:devops", query="MySQL version RDS endpoint")
recall_context(project="ahrq:terraform", query="root module outputs")
```
Returns: Runtime requirements and infrastructure details

### 4. Synthesizes Context
Combines all sources into a single context that includes:
- Your project's code and architecture
- All dependencies and their requirements
- All enforced contracts
- Complete infrastructure details

---

## Example: Working on ahrq:drupal:ahrqgov

### Scenario: You need to update Drupal code

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ahrq/ahrqgov-drupal.git
   cd ahrqgov-drupal
   code .
   ```

2. **Switch to drupal-builder mode:**
   - UGIP Phase 4 automatically queries:
     - shared:registry → Discover dependencies
     - ahrq:infra:drupal-deploy → PHP 8.3+, Docker image tag
     - ahrq:infra:devops → MySQL 8.0+, RDS endpoint
     - ahrq:terraform → VPC, subnet IDs

3. **You now know:**
   - PHP version must be 8.3+
   - MySQL version must be 8.0+
   - Drupal version must be 10.x
   - Qdrant must be latest
   - Your code runs in Docker on ECS
   - Your database is in RDS
   - Your VPC and subnets are defined in Terraform

4. **Write code with full context:**
   - No need to manually check infrastructure requirements
   - No need to ask DevOps for PHP version
   - No need to look up RDS endpoint
   - Everything is automatically available

---

## Example: Working on ahrq:infra:devops

### Scenario: You need to update infrastructure

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ahrq/terraform-devops.git
   cd terraform-devops
   code .
   ```

2. **Switch to cloud-architect mode:**
   - UGIP Phase 4 automatically queries:
     - shared:registry → Discover all AHRQ projects
     - ahrq:terraform → Root module outputs
     - ahrq:infra:drupal-deploy → Deployment requirements
     - ahrq:drupal:* → Drupal site requirements

3. **You now know:**
   - All 3 Drupal sites depend on your infrastructure
   - PHP 8.3+ must be available
   - MySQL 8.0+ must be available
   - Qdrant endpoint must be accessible
   - All Drupal sites need VPC, RDS, ALB, security groups

4. **Make infrastructure changes with full context:**
   - No need to manually check Drupal requirements
   - No need to ask Drupal team what they need
   - No need to look up contracts
   - Everything is automatically available

---

## Troubleshooting

### Problem: Project name not recognized

**Solution:** Check your workspace directory name matches the naming convention:
- Workspace: `/path/to/ahrq-drupal-ahrqgov`
- Expected: `ahrq:drupal:ahrqgov`

If they don't match, manually set PROJECT_NAME in `.ai-memory/ROO_CODE_CONTEXT.md`

### Problem: Qdrant queries return no results

**Solution:** Verify Qdrant is running:
```bash
curl http://localhost:6333/collections/agent-memory
```

If not running, start it:
```bash
docker-compose up -d qdrant ollama
```

### Problem: Cross-project queries not executing

**Solution:** Verify the global rules files are updated with cross-project initialization sections:
- `agent/rules-drupal-builder/memory.md`
- `agent/rules-architect/memory.md`
- `agent/rules-orchestrator/memory.md`
- `agent/rules-code/memory.md`

### Problem: Contracts not enforced

**Solution:** Verify contracts are defined in shared:registry:
```bash
recall_context(
  project="shared:registry",
  query="ahrq contracts PHP MySQL Drupal"
)
```

---

## What's Available in Each Project

### ahrq:drupal:ahrqgov
- Drupal 10.2.0 site
- Depends on: ahrq:infra:drupal-deploy, ahrq:infra:devops, ahrq:terraform
- Enforces: PHP 8.3+, Drupal 10.x, MySQL 8.0+, Qdrant latest

### ahrq:drupal:pso
- Drupal 10.2.0 site
- Depends on: ahrq:infra:drupal-deploy, ahrq:infra:devops, ahrq:terraform
- Enforces: PHP 8.3+, Drupal 10.x, MySQL 8.0+, Qdrant latest

### ahrq:drupal:ehc
- Drupal 10.2.0 site
- Depends on: ahrq:infra:drupal-deploy, ahrq:infra:devops, ahrq:terraform
- Enforces: PHP 8.3+, Drupal 10.x, MySQL 8.0+, Qdrant latest

### ahrq:infra:drupal-deploy
- ECS task definitions, ECR repositories
- Depends on: ahrq:terraform, riva:qdrant, riva:litellm-proxy
- Enforces: PHP 8.3+, Node 18+, Docker node:18-alpine, Qdrant latest

### ahrq:infra:devops
- ECS cluster, VPC, RDS, ALB
- Depends on: ahrq:terraform
- Enforces: Node 18+, MySQL 8.0+, Terraform 1.5+

### ahrq:terraform
- Terraform root modules
- Depends on: None (root module)
- Enforces: Terraform 1.5+, AWS Provider 5.0+

---

## Next Steps

1. **Clone an AHRQ repository** with the correct naming convention
2. **Open in VS Code** with Roo Cline
3. **Switch to appropriate mode** (drupal-architect, cloud-architect, etc.)
4. **UGIP Phase 4 automatically executes** cross-project queries
5. **Start working** with full cross-project context

---

## References

- **Implementation Guide:** [`CROSS_PROJECT_MEMORY_IMPLEMENTATION_GUIDE.md`](.ai-memory/CROSS_PROJECT_MEMORY_IMPLEMENTATION_GUIDE.md)
- **AHRQ Relationship Map:** [`AHRQ_RELATIONSHIP_MAP.md`](.ai-memory/AHRQ_RELATIONSHIP_MAP.md)
- **Testing Plan:** [`PHASE5_TESTING_VALIDATION_PLAN.md`](.ai-memory/PHASE5_TESTING_VALIDATION_PLAN.md)
- **ADR-003:** [`ADR-003-CROSS_PROJECT_MEMORY_ARCHITECTURE.md`](.ai-memory/ADR-003-CROSS_PROJECT_MEMORY_ARCHITECTURE.md)
