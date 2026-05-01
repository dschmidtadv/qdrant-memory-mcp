# GitHub Issue: Cross-Project Memory Architecture

## Title
Implement Cross-Project Memory Architecture for Interrelated Drupal & DevOps Projects

## Description

### Problem Statement
Currently, the Qdrant memory system isolates each project into its own namespace via the `project=` parameter. This works well for independent projects, but fails for interrelated projects (e.g., ahrqgov-drupal + ahrqgov-devops) that share runtime contracts and architectural decisions.

When a DevOps agent needs to know "what PHP version does the Drupal app require?", it must manually query the Drupal project namespace. There is no automated way to:
1. Discover project dependencies
2. Enforce cross-project contracts (e.g., "PHP 8.3 is required")
3. Validate that changes in one project don't break contracts in dependent projects

### Solution Overview
Implement three complementary patterns for handling interrelated projects:

#### Pattern 1: Shared Namespace (Tight Coupling)
Both projects write to and read from the same `project=` namespace, differentiated by tags:
```
memorize_context(project="ahrqgov", tags=["drupal", "backend"], ...)
memorize_context(project="ahrqgov", tags=["devops", "terraform"], ...)
recall_context(project="ahrqgov", tags=["devops"])
```

**Use when:** Two repos are truly one product and deploy together.

#### Pattern 2: Cross-Project Recall (Loose Coupling — Recommended)
Each project owns its namespace. Agents explicitly query sibling namespaces when needed:
```
recall_context(project="ahrqgov-drupal", query="PHP version and runtime requirements")
recall_context(project="ahrqgov-devops", query="CI/CD pipeline and Terraform state")
```

**Use when:** Projects have separate lifecycles but share runtime contracts.

#### Pattern 3: Dependency Graph in `shared-registry` (Federated — Most Scalable)
Store an explicit dependency manifest in a dedicated namespace:
```
memorize_context(
  project="shared-registry",
  tags=["dependency-map", "ahrqgov"],
  content="# Project Dependency Map\n- ahrqgov-drupal → ahrqgov-devops (ECS task def)\n- ahrqgov-devops → ahrqgov-drupal (PHP version, Docker image tag)"
)
```

**Use when:** 5+ interrelated projects need a registry of who depends on what.

---

## Implementation Tasks

### Phase 1: Documentation & ADR
- [ ] Create ADR-003: Cross-Project Memory Architecture
- [ ] Document all three patterns with examples
- [ ] Create decision matrix for pattern selection
- [ ] Store in Qdrant with tags: `["adr", "architecture", "cross-project", "memory"]`

### Phase 2: Naming Convention & Shared Registry
- [ ] Define project naming convention: `{client}-{service}` (e.g., `ahrqgov-drupal`, `ahrqgov-devops`)
- [ ] Create `shared-registry` namespace documentation
- [ ] Define contract tagging standard: `tags=["contract"]` for cross-project dependencies
- [ ] Update [`agent/roo-code-settings.json`](../../agent/roo-code-settings.json) with naming guidelines

### Phase 3: UGIP Mode Hook Updates
- [ ] Update `cloud-architect` mode hook to query `shared-registry` at initialization
- [ ] Update `devops-engineer` mode hook to query sibling project namespaces
- [ ] Update `drupal-architect` mode hook to query `shared-registry`
- [ ] Add cross-project recall to `orchestrator` mode initialization

### Phase 4: Implementation Guide
- [ ] Create `.ai-memory/CROSS_PROJECT_MEMORY_IMPLEMENTATION.md`
- [ ] Document how to bootstrap a new interrelated project pair
- [ ] Provide examples for Drupal + DevOps, Drupal + CDN, etc.
- [ ] Include troubleshooting guide for memory conflicts

### Phase 5: Testing & Validation
- [ ] Test Pattern 2 (cross-project recall) with ahrqgov-drupal + ahrqgov-devops
- [ ] Verify `shared-registry` namespace isolation
- [ ] Validate contract enforcement via tags
- [ ] Test UGIP mode hook cross-project queries

### Phase 6: Apply to Existing Projects
- [ ] Apply to ahrqgov-drupal + ahrqgov-devops
- [ ] Apply to pso-drupal + pso-devops (if exists)
- [ ] Apply to github-runner + other CI/CD projects
- [ ] Document lessons learned

---

## Acceptance Criteria

- [ ] ADR-003 stored in Qdrant with full decision matrix
- [ ] Naming convention documented and enforced in [`agent/roo-code-settings.json`](../../agent/roo-code-settings.json)
- [ ] `shared-registry` namespace created and tested
- [ ] UGIP mode hooks updated for cross-project recall
- [ ] Implementation guide created with working examples
- [ ] All three patterns tested and validated
- [ ] At least one real project pair (ahrqgov-drupal + ahrqgov-devops) using Pattern 2
- [ ] No breaking changes to existing single-project workflows

---

## Related Issues
- Phase 5 from [`ROO_CODE_CONTEXT.md`](../../ROO_CODE_CONTEXT.md): "Apply Migration to Other Projects"
- ADR-002: Dual-Brain Memory Architecture (GitNexus + Qdrant)

---

## Labels
- `architecture`
- `memory-system`
- `cross-project`
- `qdrant`
- `enhancement`

---

## Milestone
Phase 5: Apply Migration to Other Projects

---

## Assignee
@dschmidt

---

## Branch
`feature/cross-project-memory-architecture`

