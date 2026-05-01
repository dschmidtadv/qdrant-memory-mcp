# ADR-003: Cross-Project Memory Architecture

**Date:** 2026-05-01  
**Status:** PROPOSED  
**Author:** dschmidt  
**Related Issue:** [#36](https://github.com/dschmidtadv/qdrant-memory-mcp/issues/36)  
**Related ADRs:** ADR-001 (Qdrant Migration), ADR-002 (Dual-Brain Memory)

---

## Problem Statement

The current Qdrant memory system isolates each project into its own namespace via the `project=` parameter. This works well for independent projects but fails for **interrelated projects** (e.g., ahrqgov-drupal + ahrqgov-devops) that share runtime contracts and architectural decisions.

### Current Limitations

1. **No automated cross-project discovery** — Agents must manually know which projects to query
2. **No contract enforcement** — When Drupal requires PHP 8.3, DevOps has no way to validate this requirement
3. **No dependency tracking** — No registry of which projects depend on which
4. **Manual synchronization** — Changes in one project don't automatically propagate to dependent projects

### Example Scenario

A DevOps agent needs to answer: "What PHP version does the Drupal app require?"

**Current workflow:**
```
DevOps Agent → (manual query) → recall_context(project="ahrqgov-drupal", query="PHP version")
```

**Desired workflow:**
```
DevOps Agent → (automatic at init) → recall_context(project="shared-registry", query="ahrqgov dependencies")
                                    → recall_context(project="ahrqgov-drupal", query="PHP version")
```

---

## Solution: Three Complementary Patterns

### Pattern 1: Shared Namespace (Tight Coupling)

**When to use:** Two repos are truly one product and deploy together (e.g., monorepo with Drupal + DevOps in same repo).

**How it works:**
```
memorize_context(project="ahrqgov", tags=["drupal", "backend"], ...)
memorize_context(project="ahrqgov", tags=["devops", "terraform"], ...)
recall_context(project="ahrqgov", tags=["devops"])  # Only DevOps entries
```

**Tradeoffs:**
- ✅ Simple — single namespace
- ✅ Tight coupling — guaranteed consistency
- ❌ Memory pollution — Drupal and DevOps entries mix
- ❌ Tag discipline required — must enforce strict tagging

**Use case:** Monorepo with shared deployment pipeline.

---

### Pattern 2: Cross-Project Recall (Loose Coupling — Recommended)

**When to use:** Projects have separate lifecycles but share runtime contracts (e.g., separate GitHub repos, separate deployment schedules).

**How it works:**

Each project owns its namespace. Agents explicitly query sibling namespaces when needed:

```
# In ahrqgov-devops project:
recall_context(project="ahrqgov-drupal", query="PHP version and runtime requirements")
recall_context(project="ahrqgov-devops", query="CI/CD pipeline and Terraform state")
```

**Tradeoffs:**
- ✅ Clean separation — each project owns its namespace
- ✅ Loose coupling — projects can evolve independently
- ✅ Explicit contracts — cross-project queries are visible in code
- ❌ Manual discovery — agents must know which projects to query
- ❌ No automatic propagation — changes don't auto-sync

**Use case:** Separate Drupal and DevOps repos with shared runtime contracts.

---

### Pattern 3: Dependency Graph in `shared-registry` (Federated — Most Scalable)

**When to use:** 5+ interrelated projects need a registry of who depends on what (e.g., Drupal + DevOps + CDN + Auth service + Monitoring).

**How it works:**

Store an explicit dependency manifest in a dedicated `shared-registry` namespace:

```
memorize_context(
  project="shared-registry",
  tags=["dependency-map", "ahrqgov"],
  content="""
# Project Dependency Map: ahrqgov

## Projects
- ahrqgov-drupal: Drupal 10 backend
- ahrqgov-devops: Terraform + ECS infrastructure
- ahrqgov-cdn: CloudFront CDN configuration
- ahrqgov-auth: OAuth2 service

## Dependencies
- ahrqgov-drupal → ahrqgov-devops (ECS task def, PHP 8.3 required)
- ahrqgov-drupal → ahrqgov-cdn (origin domain)
- ahrqgov-devops → ahrqgov-drupal (Docker image tag, PHP version)
- ahrqgov-cdn → ahrqgov-drupal (origin domain)
- ahrqgov-auth → ahrqgov-drupal (OAuth2 endpoints)

## Contracts
- PHP: 8.3+ (enforced by ahrqgov-drupal)
- Node: 18+ (enforced by ahrqgov-devops)
- Docker base: node:18-alpine (enforced by ahrqgov-devops)
"""
)
```

Agents bootstrap with:
```
recall_context(project="shared-registry", query="dependency map ahrqgov")
```

**Tradeoffs:**
- ✅ Scalable — handles 5+ projects
- ✅ Explicit contracts — all dependencies documented
- ✅ Federated — no single point of failure
- ✅ Queryable — agents can discover dependencies
- ❌ Maintenance overhead — must keep registry in sync
- ❌ Eventual consistency — registry may lag behind reality

**Use case:** Large microservices ecosystem with many interdependencies.

---

## Decision Matrix: Which Pattern to Use?

| Scenario | Pattern | Reasoning |
|----------|---------|-----------|
| Monorepo (Drupal + DevOps in same repo) | Pattern 1 | Tight coupling justified by shared deployment |
| Separate repos, 2 projects (Drupal + DevOps) | Pattern 2 | Loose coupling, explicit contracts, no registry overhead |
| Separate repos, 3-4 projects | Pattern 2 | Still manageable with cross-project recall |
| Separate repos, 5+ projects | Pattern 3 | Registry needed to avoid query explosion |
| Microservices ecosystem | Pattern 3 | Federated discovery essential |
| High-frequency cross-project changes | Pattern 1 | Tight coupling ensures consistency |
| Infrequent cross-project changes | Pattern 2 | Loose coupling acceptable |

---

## Implementation Roadmap

### Phase 1: Documentation & ADR ✅
- [x] Create ADR-003 (this document)
- [x] Document all three patterns with examples
- [x] Create decision matrix for pattern selection
- [ ] Store in Qdrant with tags: `["adr", "architecture", "cross-project", "memory"]`

### Phase 2: Naming Convention & Shared Registry
- [ ] Define project naming convention: `{client}-{service}` (e.g., `ahrqgov-drupal`, `ahrqgov-devops`)
- [ ] Create `shared-registry` namespace documentation
- [ ] Define contract tagging standard: `tags=["contract"]` for cross-project dependencies
- [ ] Update [`agent/roo-code-settings.json`](../agent/roo-code-settings.json) with naming guidelines

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

## Recommended Approach for qdrant-memory-mcp

**Recommendation:** Start with **Pattern 2 (Cross-Project Recall)** for ahrqgov-drupal + ahrqgov-devops, with a plan to add **Pattern 3 (shared-registry)** if more projects are added.

**Rationale:**
1. Drupal and DevOps are separate repos with separate lifecycles
2. They share clear runtime contracts (PHP version, Docker base image)
3. Pattern 2 is simpler to implement than Pattern 3
4. Pattern 2 can be extended to Pattern 3 later without breaking changes

**Bootstrap sequence for DevOps agent:**
```typescript
// Phase 1: Query shared registry for dependency map
const depMap = await recall_context({
  project: "shared-registry",
  query: "dependency map ahrqgov"
});

// Phase 2: Query Drupal project for runtime requirements
const drupalReqs = await recall_context({
  project: "ahrqgov-drupal",
  query: "PHP version and runtime requirements"
});

// Phase 3: Query own project for infrastructure state
const devopsState = await recall_context({
  project: "ahrqgov-devops",
  query: "CI/CD pipeline and Terraform state"
});

// Phase 4: Synthesize all three sources
const context = synthesize(depMap, drupalReqs, devopsState);
```

---

## Implementation Checklist

- [ ] ADR-003 approved and stored in Qdrant
- [ ] Naming convention documented in [`agent/roo-code-settings.json`](../agent/roo-code-settings.json)
- [ ] `shared-registry` namespace created with initial dependency map
- [ ] UGIP mode hooks updated for cross-project recall
- [ ] Implementation guide created with working examples
- [ ] All three patterns tested and validated
- [ ] At least one real project pair (ahrqgov-drupal + ahrqgov-devops) using Pattern 2
- [ ] No breaking changes to existing single-project workflows

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Memory pollution** (Pattern 1) | Enforce strict tag discipline; use Pattern 2 or 3 instead |
| **Query explosion** (Pattern 2 with 5+ projects) | Migrate to Pattern 3 with shared-registry |
| **Registry drift** (Pattern 3) | Automated validation; CI/CD checks for contract violations |
| **Cross-project coupling** | Use loose coupling (Pattern 2); avoid tight coupling (Pattern 1) |
| **Eventual consistency** | Document that registry may lag; use explicit versioning |

---

## Alternatives Considered

### Alternative 1: Single Global Namespace
**Rejected:** Would cause severe memory pollution; no project isolation.

### Alternative 2: Separate Qdrant Collections per Project
**Rejected:** Would require separate MCP server instances; adds operational complexity.

### Alternative 3: External Dependency Registry (e.g., Consul)
**Rejected:** Adds external dependency; Qdrant already provides this capability.

---

## References

- **ADR-001:** Qdrant Migration (stored in Qdrant memory)
- **ADR-002:** Dual-Brain Memory Architecture (stored in Qdrant memory)
- **GitHub Issue #36:** Cross-Project Memory Architecture
- **ROO_CODE_CONTEXT.md:** Project architecture and global rules system

---

## Approval

| Role | Status | Date |
|------|--------|------|
| Author (dschmidt) | PROPOSED | 2026-05-01 |
| Architecture Review | PENDING | — |
| Implementation Lead | PENDING | — |

---

## Status

**Current:** PROPOSED  
**Next:** Architecture Review  
**Target Implementation:** Phase 1 (Documentation) — COMPLETE  
**Target Completion:** Phase 6 (Apply to Existing Projects) — Q2 2026

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-05-01 | 1.0 | Initial ADR created |

