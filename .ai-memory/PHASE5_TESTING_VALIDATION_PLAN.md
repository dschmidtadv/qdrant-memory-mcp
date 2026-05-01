# Phase 5: Testing & Validation with Real AHRQ Projects

**Date:** 2026-05-01  
**Status:** TESTING PLAN READY  
**Target:** Validate cross-project memory architecture with real AHRQ projects

---

## Overview

Phase 5 validates the cross-project memory architecture by testing with real AHRQ projects:
- `ahrq:drupal:ahrqgov` — Drupal site
- `ahrq:infra:devops` — Infrastructure
- `ahrq:infra:drupal-deploy` — Drupal deployment infrastructure
- `ahrq:terraform` — Terraform root modules

---

## Test Plan

### Test 1: Verify Qdrant Storage

**Objective:** Confirm all AHRQ data is stored in Qdrant

**Steps:**
1. Query shared:registry for AHRQ relationship map
2. Query ahrq:drupal:ahrqgov for project manifest
3. Query ahrq:infra:drupal-deploy for project manifest
4. Query ahrq:infra:devops for project manifest
5. Query ahrq:terraform for project manifest

**Expected Results:**
- All 5 queries return valid results
- Relationship map contains all 6 projects
- Each project manifest contains identity, dependencies, contracts

**Verification:**
```bash
# Test 1.1: Query shared:registry
recall_context(
  project="shared:registry",
  query="ahrq relationship map"
)
# Expected: Complete AHRQ dependency graph

# Test 1.2: Query ahrq:drupal:ahrqgov manifest
recall_context(
  project="ahrq:drupal:ahrqgov",
  tags=["manifest"],
  query="dependencies contracts"
)
# Expected: Project manifest with dependencies on infra:drupal-deploy, infra:devops, terraform

# Test 1.3: Query ahrq:infra:drupal-deploy manifest
recall_context(
  project="ahrq:infra:drupal-deploy",
  tags=["manifest"],
  query="PHP version Docker image"
)
# Expected: PHP 8.3+, Docker image tag

# Test 1.4: Query ahrq:infra:devops manifest
recall_context(
  project="ahrq:infra:devops",
  tags=["manifest"],
  query="MySQL version RDS"
)
# Expected: MySQL 8.0+, RDS configuration

# Test 1.5: Query ahrq:terraform manifest
recall_context(
  project="ahrq:terraform",
  tags=["manifest"],
  query="root module outputs"
)
# Expected: VPC, subnet, security group outputs
```

---

### Test 2: UGIP Phase 4 Cross-Project Initialization

**Objective:** Verify UGIP Phase 4 automatically queries dependencies

**Steps:**
1. Open ahrq:drupal:ahrqgov in VS Code
2. Switch to drupal-architect mode
3. Observe UGIP Phase 4 initialization logs
4. Verify cross-project queries execute

**Expected Results:**
- UGIP Phase 4 extracts ORG = "ahrq"
- Queries shared:registry for relationship map
- Queries ahrq:infra:drupal-deploy for PHP version
- Queries ahrq:infra:devops for MySQL version
- Queries ahrq:terraform for VPC outputs
- Synthesizes all sources into context

**Verification Checklist:**
- [ ] ORG extraction: "Extracted ORG = ahrq"
- [ ] Registry query: "Querying shared:registry for ahrq relationship map"
- [ ] Dependency queries: "Querying ahrq:infra:drupal-deploy for PHP version"
- [ ] All 4 dependency queries execute
- [ ] Synthesis: "Synthesized context from 5 sources"

---

### Test 3: Contract Enforcement

**Objective:** Verify contracts are enforced across projects

**Steps:**
1. Query PHP contract owner (ahrq:infra:drupal-deploy)
2. Query MySQL contract owner (ahrq:infra:devops)
3. Query Drupal contract owner (ahrq:drupal:ahrqgov)
4. Verify all consumers are listed

**Expected Results:**
- PHP 8.3+ enforced by ahrq:infra:drupal-deploy
- MySQL 8.0+ enforced by ahrq:infra:devops
- Drupal 10.x enforced by ahrq:drupal:ahrqgov
- All consumers listed for each contract

**Verification:**
```bash
# Test 3.1: PHP contract
recall_context(
  project="shared:registry",
  query="PHP 8.3 contract owner ahrq:infra:drupal-deploy"
)
# Expected: PHP 8.3+ enforced, consumers: ahrq:drupal:ahrqgov, ahrq:drupal:pso, ahrq:drupal:ehc

# Test 3.2: MySQL contract
recall_context(
  project="shared:registry",
  query="MySQL 8.0 contract owner ahrq:infra:devops"
)
# Expected: MySQL 8.0+ enforced, consumers: all Drupal sites

# Test 3.3: Drupal contract
recall_context(
  project="shared:registry",
  query="Drupal 10.x contract owner ahrq:drupal:ahrqgov"
)
# Expected: Drupal 10.x enforced
```

---

### Test 4: Dependency Resolution

**Objective:** Verify dependency chain resolution works correctly

**Steps:**
1. Start with ahrq:drupal:ahrqgov
2. Query its dependencies
3. Query each dependency's dependencies
4. Verify complete chain resolves

**Expected Results:**
- ahrq:drupal:ahrqgov depends on ahrq:infra:drupal-deploy, ahrq:infra:devops, ahrq:terraform
- ahrq:infra:drupal-deploy depends on ahrq:terraform, riva:qdrant, riva:litellm-proxy
- ahrq:infra:devops depends on ahrq:terraform
- ahrq:terraform has no dependencies (root)

**Verification:**
```bash
# Test 4.1: Direct dependencies
recall_context(
  project="shared:registry",
  query="ahrq:drupal:ahrqgov depends on"
)
# Expected: ahrq:infra:drupal-deploy, ahrq:infra:devops, ahrq:terraform

# Test 4.2: Transitive dependencies
recall_context(
  project="shared:registry",
  query="ahrq:infra:drupal-deploy depends on"
)
# Expected: ahrq:terraform, riva:qdrant, riva:litellm-proxy

# Test 4.3: Root module
recall_context(
  project="shared:registry",
  query="ahrq:terraform depends on"
)
# Expected: None (root module)
```

---

### Test 5: Cross-Organization Queries

**Objective:** Verify queries work across organization boundaries

**Steps:**
1. Query RIVA projects from AHRQ context
2. Query shared:registry from any project
3. Verify cross-org filtering works

**Expected Results:**
- AHRQ projects can query RIVA projects
- shared:registry accessible from any project
- Cross-org filtering maintains data isolation

**Verification:**
```bash
# Test 5.1: Query RIVA from AHRQ context
recall_context(
  project="shared:registry",
  query="riva:qdrant riva:litellm-proxy"
)
# Expected: RIVA projects found

# Test 5.2: Query shared:registry from any project
recall_context(
  project="qdrant-memory-mcp",
  query="shared:registry"
)
# Expected: shared:registry accessible
```

---

## Test Execution

### Prerequisites

- [ ] Qdrant running and accessible
- [ ] MCP server running (PID verified)
- [ ] All AHRQ data stored in Qdrant (6 chunks confirmed)
- [ ] VS Code with Roo Cline extension
- [ ] Access to AHRQ project repositories

### Test Sequence

1. **Test 1: Qdrant Storage** — 15 minutes
   - Execute all 5 queries
   - Verify results
   - Document findings

2. **Test 2: UGIP Phase 4** — 20 minutes
   - Open ahrq:drupal:ahrqgov
   - Switch to drupal-architect mode
   - Observe initialization logs
   - Verify cross-project queries

3. **Test 3: Contract Enforcement** — 10 minutes
   - Execute 3 contract queries
   - Verify owners and consumers
   - Document findings

4. **Test 4: Dependency Resolution** — 15 minutes
   - Execute 3 dependency queries
   - Verify complete chain
   - Document findings

5. **Test 5: Cross-Organization** — 10 minutes
   - Execute 2 cross-org queries
   - Verify filtering
   - Document findings

**Total Time:** ~70 minutes

---

## Success Criteria

### Must Pass
- [ ] All 5 Qdrant storage queries return valid results
- [ ] UGIP Phase 4 executes all cross-project queries
- [ ] All 7 contracts are properly defined and queryable
- [ ] Complete dependency chain resolves correctly
- [ ] Cross-organization queries work without errors

### Should Pass
- [ ] Query response times < 2 seconds
- [ ] All results are properly formatted markdown
- [ ] Tags are correctly applied to all data
- [ ] Project filtering works correctly

### Nice to Have
- [ ] Query scores > 0.5 (semantic relevance)
- [ ] No duplicate results
- [ ] Consistent ordering of results

---

## Failure Handling

### If Test 1 Fails (Qdrant Storage)
- Check Qdrant service status
- Verify MCP server is running
- Check collection dimensions (should be 768-dim)
- Re-run memorize_context if needed

### If Test 2 Fails (UGIP Phase 4)
- Check global rules files are updated
- Verify ORG extraction logic
- Check mode-specific queries in customInstructions
- Review UGIP Phase 4 logs

### If Test 3 Fails (Contract Enforcement)
- Verify contracts are defined in shared:registry
- Check project manifests declare contract dependencies
- Verify tags are correctly applied

### If Test 4 Fails (Dependency Resolution)
- Verify relationship map is complete
- Check all projects are stored in Qdrant
- Verify project names match exactly

### If Test 5 Fails (Cross-Organization)
- Check project filtering logic
- Verify namespace isolation
- Check cross-org query syntax

---

## Documentation

### Test Results Template

```markdown
# Phase 5 Test Results: {DATE}

## Test 1: Qdrant Storage
- [ ] Query 1.1: shared:registry relationship map — PASS/FAIL
- [ ] Query 1.2: ahrq:drupal:ahrqgov manifest — PASS/FAIL
- [ ] Query 1.3: ahrq:infra:drupal-deploy manifest — PASS/FAIL
- [ ] Query 1.4: ahrq:infra:devops manifest — PASS/FAIL
- [ ] Query 1.5: ahrq:terraform manifest — PASS/FAIL

## Test 2: UGIP Phase 4
- [ ] ORG extraction — PASS/FAIL
- [ ] Registry query — PASS/FAIL
- [ ] Dependency queries (4) — PASS/FAIL
- [ ] Synthesis — PASS/FAIL

## Test 3: Contract Enforcement
- [ ] PHP contract — PASS/FAIL
- [ ] MySQL contract — PASS/FAIL
- [ ] Drupal contract — PASS/FAIL

## Test 4: Dependency Resolution
- [ ] Direct dependencies — PASS/FAIL
- [ ] Transitive dependencies — PASS/FAIL
- [ ] Root module — PASS/FAIL

## Test 5: Cross-Organization
- [ ] RIVA query from AHRQ — PASS/FAIL
- [ ] shared:registry from any project — PASS/FAIL

## Summary
- Total Tests: 15
- Passed: {X}
- Failed: {Y}
- Success Rate: {X/15 * 100}%

## Issues Found
[List any issues]

## Recommendations
[List any recommendations]
```

---

## Next Steps After Phase 5

### If All Tests Pass ✅
- Proceed to Phase 6: Apply to other organizations
- Create pull request to merge feature branch to main
- Document lessons learned

### If Some Tests Fail ⚠️
- Debug and fix issues
- Re-run failed tests
- Document root causes
- Update implementation guides

### If Critical Tests Fail ❌
- Halt Phase 5
- Create subtask to resolve issues
- Review architecture design
- Consider alternative approaches

---

## References

- **ADR-003:** [`ADR-003-CROSS_PROJECT_MEMORY_ARCHITECTURE.md`](.ai-memory/ADR-003-CROSS_PROJECT_MEMORY_ARCHITECTURE.md)
- **AHRQ Relationship Map:** [`AHRQ_RELATIONSHIP_MAP.md`](.ai-memory/AHRQ_RELATIONSHIP_MAP.md)
- **Implementation Guide:** [`CROSS_PROJECT_MEMORY_IMPLEMENTATION_GUIDE.md`](.ai-memory/CROSS_PROJECT_MEMORY_IMPLEMENTATION_GUIDE.md)
- **Qdrant Fix:** [`QDRANT_RECALL_CONTEXT_FIX_2026-05-01.md`](.ai-memory/QDRANT_RECALL_CONTEXT_FIX_2026-05-01.md)
