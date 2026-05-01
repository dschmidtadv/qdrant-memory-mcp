# Verification Prompt: Cross-Project Memory Architecture

**Date:** 2026-05-01  
**Status:** READY TO USE  
**Purpose:** Test prompt to verify the system works as intended

---

## Verification Prompt

Copy and paste this prompt into any AHRQ project (after setting up .env) to verify the cross-project memory architecture is working:

```
I'm working on the ahrq:drupal:ahrqgov project. 

Please verify that the cross-project memory architecture is working by:

1. Confirming you can access the AHRQ relationship map from shared:registry
2. Listing all 6 AHRQ projects and their relationships
3. Confirming the 7 enforced contracts (PHP, Node, Drupal, MySQL, Qdrant, Docker, Terraform)
4. Showing the complete dependency chain for ahrq:drupal:ahrqgov
5. Confirming you have access to infrastructure requirements (PHP version, MySQL version, VPC details)

If all 5 items are confirmed, the system is working correctly.
```

---

## What to Expect

If the system is working correctly, you should see:

### 1. AHRQ Relationship Map ✅
The system should return the complete AHRQ relationship map showing:
- All 6 projects: ahrq:drupal:ahrqgov, ahrq:drupal:pso, ahrq:drupal:ehc, ahrq:terraform, ahrq:infra:devops, ahrq:infra:drupal-deploy
- All relationships and dependencies
- Complete dependency graph

### 2. All 6 AHRQ Projects Listed ✅
```
- ahrq:drupal:ahrqgov (Drupal Site)
- ahrq:drupal:pso (Drupal Site)
- ahrq:drupal:ehc (Drupal Site)
- ahrq:terraform (Infrastructure)
- ahrq:infra:devops (Infrastructure)
- ahrq:infra:drupal-deploy (Infrastructure)
```

### 3. All 7 Contracts Confirmed ✅
```
- PHP: 8.3+ (owner: ahrq:infra:drupal-deploy)
- Node: 18+ (owner: ahrq:infra:devops)
- Drupal: 10.x (owner: ahrq:drupal:ahrqgov)
- MySQL: 8.0+ (owner: ahrq:infra:devops)
- Qdrant: latest (owner: riva:qdrant)
- Docker base: node:18-alpine (owner: ahrq:infra:drupal-deploy)
- Terraform: 1.5+ (owner: ahrq:terraform)
```

### 4. Complete Dependency Chain ✅
```
ahrq:drupal:ahrqgov depends on:
  ├── ahrq:infra:drupal-deploy
  │   ├── ahrq:terraform
  │   ├── riva:qdrant
  │   └── riva:litellm-proxy
  ├── ahrq:infra:devops
  │   └── ahrq:terraform
  └── ahrq:terraform
```

### 5. Infrastructure Requirements Available ✅
```
- PHP version: 8.3+
- MySQL version: 8.0+
- VPC: Available from ahrq:terraform
- RDS endpoint: Available from ahrq:infra:devops
- ALB: Available from ahrq:infra:devops
- Security groups: Available from ahrq:terraform
```

---

## Troubleshooting

### If You See: "No results found"

**Problem:** Qdrant is not returning data

**Solution:**
1. Verify Qdrant is running: `curl http://localhost:6333/collections/agent-memory`
2. Check MCP server is running: `pgrep -f "node.*mcp-server/dist/index.js"`
3. Rebuild MCP server: `cd mcp-server && npm run build && npm start`

### If You See: "PROJECT_NAME not recognized"

**Problem:** .env file not being read

**Solution:**
1. Verify .env exists: `ls -la .env`
2. Check format: `cat .env` (should show: `PROJECT_NAME=ahrq:drupal:ahrqgov`)
3. Verify no spaces around =: `grep "PROJECT_NAME=" .env`

### If You See: "ORG extraction failed"

**Problem:** PROJECT_NAME format incorrect

**Solution:**
1. Verify format: `{org}:{domain}:{project}`
2. Check .env: `cat .env`
3. Should be: `PROJECT_NAME=ahrq:drupal:ahrqgov` (not `ahrq-drupal-ahrqgov`)

### If You See: "Dependency queries not executing"

**Problem:** UGIP Phase 4 not running cross-project queries

**Solution:**
1. Verify global rules files are updated with cross-project initialization
2. Check mode-specific queries in customInstructions
3. Review UGIP Phase 4 logs for errors

---

## Alternative Verification Prompts

### Minimal Verification
```
Can you confirm the AHRQ relationship map is accessible from shared:registry?
```

### Detailed Verification
```
I'm working on ahrq:drupal:ahrqgov. 

Please show me:
1. The complete AHRQ relationship map
2. All dependencies for ahrq:drupal:ahrqgov
3. All enforced contracts
4. The dependency chain from ahrq:drupal:ahrqgov to ahrq:terraform
```

### Contract Verification
```
I'm working on ahrq:drupal:ahrqgov.

Please confirm all 7 AHRQ contracts:
1. PHP version requirement
2. Node version requirement
3. Drupal version requirement
4. MySQL version requirement
5. Qdrant version requirement
6. Docker base image requirement
7. Terraform version requirement

For each contract, show the owner and consumers.
```

### Infrastructure Verification
```
I'm working on ahrq:drupal:ahrqgov.

Please show me all infrastructure requirements:
1. PHP version and where it's enforced
2. MySQL version and RDS endpoint
3. VPC and subnet configuration
4. Security groups
5. ALB configuration
6. Qdrant endpoint
```

---

## Success Criteria

✅ **All 5 items confirmed** — System is working correctly
⚠️ **3-4 items confirmed** — System is partially working, check troubleshooting
❌ **0-2 items confirmed** — System needs debugging, see troubleshooting section

---

## References

- **Quick Start Guide:** [`QUICK_START_AHRQ_REPOS.md`](.ai-memory/QUICK_START_AHRQ_REPOS.md)
- **Simplified .env:** [`SIMPLIFIED_ENV_CONFIGURATION.md`](.ai-memory/SIMPLIFIED_ENV_CONFIGURATION.md)
- **Testing Plan:** [`PHASE5_TESTING_VALIDATION_PLAN.md`](.ai-memory/PHASE5_TESTING_VALIDATION_PLAN.md)
- **AHRQ Relationship Map:** [`AHRQ_RELATIONSHIP_MAP.md`](.ai-memory/AHRQ_RELATIONSHIP_MAP.md)
