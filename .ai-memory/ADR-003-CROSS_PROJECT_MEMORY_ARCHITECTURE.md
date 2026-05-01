# ADR-003: Cross-Project Memory Architecture with Hierarchical Naming & Relationship Mapping

**Date:** 2026-05-01  
**Status:** PROPOSED  
**Author:** dschmidt  
**Related Issue:** [#36](https://github.com/dschmidtadv/qdrant-memory-mcp/issues/36)  
**Related ADRs:** ADR-001 (Qdrant Migration), ADR-002 (Dual-Brain Memory)

---

## Problem Statement

The current Qdrant memory system isolates each project into its own namespace via the `project=` parameter. This works well for independent projects but fails for **interrelated projects** (e.g., multiple Drupal sites + shared infrastructure) that share runtime contracts and architectural decisions.

### Current Limitations

1. **No automated cross-project discovery** — Agents must manually know which projects to query
2. **No contract enforcement** — When infrastructure requires PHP 8.3, Drupal projects have no way to validate this requirement
3. **No dependency tracking** — No registry of which projects depend on which
4. **Manual synchronization** — Changes in one project don't automatically propagate to dependent projects
5. **Naming ambiguity** — Flat naming (`ahrqgov-drupal`) doesn't express organizational hierarchy

### Example Scenario

A Drupal agent needs to answer: "What PHP version does my infrastructure support? What are my database endpoints?"

**Current workflow:**
```
Drupal Agent → (manual query) → recall_context(project="ahrqgov-drupal", query="PHP version")
```

**Desired workflow:**
```
Drupal Agent → (automatic at init) → recall_context(project="shared:registry", query="ahrq:drupal:ahrqgov dependencies")
                                    → recall_context(project="ahrq:infra:drupal-deploy", query="PHP version Docker image")
                                    → recall_context(project="ahrq:terraform", query="RDS endpoints VPC IDs")
```

---

## Solution: Hierarchical Naming + Relationship Mapping

### Part 1: Hierarchical Naming Convention

All projects use an **org-first hierarchical naming convention**:

```
{org}:{domain}:{project}   ← 3-segment for multi-project domains
{org}:{domain}             ← 2-segment for singleton domains
```

#### Examples

**AHRQ Organization:**
```
ahrq:drupal:ahrqgov        ← AHRQ.gov Drupal site
ahrq:drupal:pso            ← PSO Drupal site
ahrq:drupal:ehc            ← EHC Drupal site
ahrq:terraform             ← Terraform root modules (singleton)
ahrq:infra:devops          ← Core ECS/VPC/RDS infrastructure
ahrq:infra:drupal-deploy   ← Drupal-specific ECS task defs + ECR
```

**RIVA Organization:**
```
riva:qdrant                ← Qdrant memory service (singleton)
riva:litellm-proxy         ← LiteLLM proxy (singleton)
```

**Cross-Organization:**
```
shared:registry            ← Relationship maps and contracts (singleton)
```

#### Naming Rules

1. **Org segment** — lowercase, no hyphens (e.g., `ahrq`, `riva`, `shared`)
2. **Domain segment** — lowercase, describes the functional area (e.g., `drupal`, `infra`, `terraform`)
3. **Project segment** — lowercase with hyphens, specific project name (e.g., `ahrqgov`, `drupal-deploy`)
4. **Singleton domains** — omit project segment if only one project in that domain

---

### Part 2: Relationship Mapping (Mechanism 1 + 2)

Projects declare their dependencies in two ways:

#### Mechanism 1: Global Relationship Registry (`shared:registry`)

A **machine-readable relationship manifest** stored in the `shared:registry` namespace. This is the **authoritative source of truth** maintained by the infrastructure team.

```
memorize_context(
  project="shared:registry",
  tags=["relationship-map", "ahrq"],
  content="""
# AHRQ Project Relationship Map

## Projects
- ahrq:drupal:ahrqgov      → Drupal 10 (AHRQ.gov)
- ahrq:drupal:pso          → Drupal 10 (PSO)
- ahrq:drupal:ehc          → Drupal 10 (EHC)
- ahrq:terraform           → Terraform root modules
- ahrq:infra:devops        → ECS, ALB, VPC, RDS
- ahrq:infra:drupal-deploy → Drupal-specific ECS task defs, ECR

## Relationships

### ahrq:drupal:ahrqgov
depends_on:
  - ahrq:infra:drupal-deploy  # ECS task def, ECR image tag, PHP version
  - ahrq:infra:devops         # VPC, RDS, ALB endpoints
  - ahrq:terraform            # Root module outputs (subnet IDs, security groups)

### ahrq:drupal:pso
depends_on:
  - ahrq:infra:drupal-deploy
  - ahrq:infra:devops
  - ahrq:terraform

### ahrq:drupal:ehc
depends_on:
  - ahrq:infra:drupal-deploy
  - ahrq:infra:devops
  - ahrq:terraform

### ahrq:infra:drupal-deploy
depends_on:
  - ahrq:terraform            # VPC IDs, subnet IDs, security group IDs
  - riva:qdrant               # Memory service endpoint
  - riva:litellm-proxy        # LLM proxy endpoint

### ahrq:infra:devops
depends_on:
  - ahrq:terraform            # Root module outputs

## Contracts (Enforced by Owner)

### PHP Version
- Owner: ahrq:infra:drupal-deploy
- Requirement: 8.3+
- Enforced in: Docker image tag, ECS task def

### Node Version
- Owner: ahrq:infra:devops
- Requirement: 18+
- Enforced in: Lambda functions, ECS task defs

### Drupal Version
- Owner: ahrq:drupal:ahrqgov
- Requirement: 10.x
- Enforced in: composer.json, Drupal core

### MySQL Version
- Owner: ahrq:infra:devops
- Requirement: 8.0+
- Enforced in: RDS parameter group

### Qdrant Version
- Owner: riva:qdrant
- Requirement: latest
- Enforced in: Docker image tag
"""
)
```

**Querying the registry:**
```
# Discover dependencies for a specific project
recall_context(project="shared:registry", query="ahrq:drupal:ahrqgov relationships")

# Discover all contracts
recall_context(project="shared:registry", query="contracts PHP version MySQL")
```

---

#### Mechanism 2: Self-Describing Project Manifest (Embedded)

Each project stores its own **manifest entry** in its own namespace, declaring its dependencies. This survives registry lag and provides project-specific context.

```
# In ahrq:drupal:ahrqgov project, at first memorize_context call:
memorize_context(
  project="ahrq:drupal:ahrqgov",
  tags=["manifest", "dependencies"],
  content="""
# Project Manifest: ahrq:drupal:ahrqgov

## Identity
- org: ahrq
- domain: drupal
- project: ahrqgov
- type: drupal-site
- version: 10.2.0

## Dependencies
- ahrq:infra:drupal-deploy  (runtime: ECS task def, ECR image tag, PHP version)
- ahrq:infra:devops         (runtime: VPC, RDS, ALB endpoints)
- ahrq:terraform            (outputs: subnet IDs, security groups, RDS endpoint)

## Contracts I Enforce
- PHP: 8.3+
- Drupal: 10.x
- MySQL: 8.0+
- Qdrant: latest

## Contracts I Depend On
- PHP: 8.3+ (from ahrq:infra:drupal-deploy)
- MySQL: 8.0+ (from ahrq:infra:devops)
- Qdrant: latest (from riva:qdrant)
"""
)
```

**Querying the manifest:**
```
# Discover dependencies from the project itself
recall_context(project="ahrq:drupal:ahrqgov", tags=["manifest"], query="dependencies")

# Discover contracts enforced by this project
recall_context(project="ahrq:drupal:ahrqgov", tags=["manifest"], query="contracts")
```

---

### Part 3: UGIP Cross-Project Query Flow

At UGIP initialization, every agent executes this sequence:

```typescript
// UGIP Phase 2: Atomic Initialization (Enhanced)

// Step 1: Read resident cache
const context = read_file('ROO_CODE_CONTEXT.md');

// Step 2: Query shared registry for relationship map
const relationshipMap = await recall_context({
  project: "shared:registry",
  query: `${ORG} relationship map dependencies for ${CURRENT_PROJECT}`
});

// Step 3: Query own project manifest
const manifest = await recall_context({
  project: CURRENT_PROJECT,
  tags: ["manifest"],
  query: "dependencies contracts"
});

// Step 4: Parse dependency list from both sources
const dependencies = union(
  relationshipMap.dependencies,
  manifest.dependencies
);

// Step 5: Query each dependency
for (const dep of dependencies) {
  const depContext = await recall_context({
    project: dep,
    query: "runtime requirements contracts"
  });
  context.dependencies[dep] = depContext;
}

// Step 6: Synthesize all sources
const synthesized = synthesize(context, relationshipMap, manifest, dependencies);
```

---

## Three Patterns for Relationship Mapping

### Pattern 1: Shared Namespace (Tight Coupling)

**When to use:** Two repos are truly one product and deploy together (e.g., monorepo with Drupal + DevOps in same repo).

**How it works:**
```
memorize_context(project="ahrq", tags=["drupal", "backend"], ...)
memorize_context(project="ahrq", tags=["devops", "terraform"], ...)
recall_context(project="ahrq", tags=["devops"])  # Only DevOps entries
```

**Tradeoffs:**
- ✅ Simple — single namespace
- ✅ Tight coupling — guaranteed consistency
- ❌ Memory pollution — Drupal and DevOps entries mix
- ❌ Tag discipline required — must enforce strict tagging

---

### Pattern 2: Cross-Project Recall (Loose Coupling — Recommended)

**When to use:** Projects have separate lifecycles but share runtime contracts (e.g., separate GitHub repos, separate deployment schedules).

**How it works:**

Each project owns its namespace. Agents explicitly query sibling namespaces when needed:

```
# In ahrq:drupal:ahrqgov project:
recall_context(project="ahrq:infra:drupal-deploy", query="PHP version Docker image")
recall_context(project="ahrq:infra:devops", query="VPC RDS ALB endpoints")
recall_context(project="ahrq:terraform", query="root module outputs")
```

**Tradeoffs:**
- ✅ Clean separation — each project owns its namespace
- ✅ Loose coupling — projects can evolve independently
- ✅ Explicit contracts — cross-project queries are visible in code
- ❌ Manual discovery — agents must know which projects to query (solved by Mechanism 1+2)
- ❌ No automatic propagation — changes don't auto-sync (mitigated by Mechanism 2)

---

### Pattern 3: Dependency Graph in `shared:registry` (Federated — Most Scalable)

**When to use:** 5+ interrelated projects need a registry of who depends on what (e.g., Drupal + DevOps + CDN + Auth service + Monitoring).

**How it works:**

Store an explicit dependency manifest in the `shared:registry` namespace (Mechanism 1). Agents query this at UGIP init to discover all dependencies.

**Tradeoffs:**
- ✅ Scalable — handles 5+ projects
- ✅ Explicit contracts — all dependencies documented
- ✅ Federated — no single point of failure
- ✅ Queryable — agents can discover dependencies
- ❌ Maintenance overhead — must keep registry in sync
- ❌ Eventual consistency — registry may lag behind reality (mitigated by Mechanism 2)

---

## Decision Matrix: Which Pattern to Use?

| Scenario | Pattern | Reasoning |
|----------|---------|-----------|
| Monorepo (Drupal + DevOps in same repo) | Pattern 1 | Tight coupling justified by shared deployment |
| Separate repos, 2-3 projects | Pattern 2 | Loose coupling, explicit contracts, no registry overhead |
| Separate repos, 4-5 projects | Pattern 2 + Mechanism 1 | Add shared registry for discovery |
| Separate repos, 5+ projects | Pattern 3 | Registry essential to avoid query explosion |
| Microservices ecosystem | Pattern 3 | Federated discovery essential |
| High-frequency cross-project changes | Pattern 1 | Tight coupling ensures consistency |
| Infrequent cross-project changes | Pattern 2 | Loose coupling acceptable |

---

## Implementation Roadmap

### Phase 1: Documentation & ADR ✅
- [x] Create ADR-003 (this document)
- [x] Document hierarchical naming convention
- [x] Document relationship mapping (Mechanism 1 + 2)
- [x] Create decision matrix for pattern selection
- [ ] Store in Qdrant with tags: `["adr", "architecture", "cross-project", "memory"]`

### Phase 2: Naming Convention & Relationship Registry
- [ ] Define hierarchical naming convention: `{org}:{domain}:{project}`
- [ ] Create `shared:registry` namespace with initial relationship map
- [ ] Define contract tagging standard: `tags=["contract"]` for cross-project dependencies
- [ ] Update [`agent/roo-code-settings.json`](../agent/roo-code-settings.json) with naming guidelines

### Phase 3: UGIP Mode Hook Updates
- [ ] Update `cloud-architect` mode hook to query `shared:registry` at initialization
- [ ] Update `devops-engineer` mode hook to query sibling project namespaces
- [ ] Update `drupal-architect` mode hook to query `shared:registry`
- [ ] Add cross-project recall to `orchestrator` mode initialization
- [ ] Implement Mechanism 1 + 2 query flow in UGIP Phase 2

### Phase 4: Implementation Guide
- [ ] Create `.ai-memory/CROSS_PROJECT_MEMORY_IMPLEMENTATION.md`
- [ ] Document how to bootstrap a new interrelated project group
- [ ] Provide examples for AHRQ (Drupal + DevOps + Terraform)
- [ ] Include troubleshooting guide for memory conflicts

### Phase 5: Testing & Validation
- [ ] Test Pattern 2 (cross-project recall) with ahrq:drupal:ahrqgov + ahrq:infra:drupal-deploy
- [ ] Verify `shared:registry` namespace isolation
- [ ] Validate contract enforcement via tags
- [ ] Test UGIP mode hook cross-project queries

### Phase 6: Apply to Existing Projects
- [ ] Apply to AHRQ projects (ahrq:drupal:*, ahrq:infra:*, ahrq:terraform)
- [ ] Apply to RIVA projects (riva:qdrant, riva:litellm-proxy)
- [ ] Create shared:registry with all relationships
- [ ] Document lessons learned

---

## Recommended Approach for qdrant-memory-mcp

**Recommendation:** Implement **Pattern 2 + Mechanism 1 + 2** for AHRQ projects, with `shared:registry` as the authoritative source of truth.

**Rationale:**
1. AHRQ has 3 Drupal sites + 3 infrastructure projects = 6 total (Pattern 3 territory)
2. Projects have separate lifecycles but share runtime contracts
3. Mechanism 1 (shared registry) provides authoritative dependency discovery
4. Mechanism 2 (project manifest) provides resilience against registry lag
5. UGIP Phase 2 enhancement enables automatic cross-project queries

**Bootstrap sequence for `ahrq:drupal:ahrqgov` agent:**
```typescript
// UGIP Phase 2: Atomic Initialization

// 1. Query shared registry for relationship map
const relationshipMap = await recall_context({
  project: "shared:registry",
  query: "ahrq:drupal:ahrqgov relationships dependencies"
});
// Returns: [ahrq:infra:drupal-deploy, ahrq:infra:devops, ahrq:terraform]

// 2. Query own project manifest
const manifest = await recall_context({
  project: "ahrq:drupal:ahrqgov",
  tags: ["manifest"],
  query: "dependencies contracts"
});

// 3. Query each dependency
const drupalDeploy = await recall_context({
  project: "ahrq:infra:drupal-deploy",
  query: "PHP version Docker image ECS task def"
});

const devops = await recall_context({
  project: "ahrq:infra:devops",
  query: "VPC RDS ALB endpoints security groups"
});

const terraform = await recall_context({
  project: "ahrq:terraform",
  query: "root module outputs subnet IDs RDS endpoint"
});

// 4. Synthesize all sources
const context = synthesize(
  residentCache,
  relationshipMap,
  manifest,
  drupalDeploy,
  devops,
  terraform
);
```

---

## Implementation Checklist

- [ ] ADR-003 approved and stored in Qdrant
- [ ] Hierarchical naming convention documented in [`agent/roo-code-settings.json`](../agent/roo-code-settings.json)
- [ ] `shared:registry` namespace created with initial relationship map
- [ ] Project manifests created for all AHRQ projects
- [ ] UGIP mode hooks updated for cross-project recall (Mechanism 1 + 2)
- [ ] Implementation guide created with working examples
- [ ] All three patterns tested and validated
- [ ] At least one real project group (ahrq:drupal:* + ahrq:infra:*) using Pattern 2 + Mechanism 1 + 2
- [ ] No breaking changes to existing single-project workflows

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Memory pollution** (Pattern 1) | Enforce strict tag discipline; use Pattern 2 or 3 instead |
| **Query explosion** (Pattern 2 with 5+ projects) | Migrate to Pattern 3 with shared:registry |
| **Registry drift** (Mechanism 1) | Implement Mechanism 2 (project manifest) as fallback |
| **Manifest staleness** (Mechanism 2) | Validate against Mechanism 1 at UGIP init |
| **Cross-project coupling** | Use loose coupling (Pattern 2); avoid tight coupling (Pattern 1) |
| **Eventual consistency** | Document that registry may lag; use explicit versioning |
| **Naming collisions** | Enforce org-first naming; validate at memorize_context time |

---

## Alternatives Considered

### Alternative 1: Single Global Namespace
**Rejected:** Would cause severe memory pollution; no project isolation.

### Alternative 2: Separate Qdrant Collections per Project
**Rejected:** Would require separate MCP server instances; adds operational complexity.

### Alternative 3: External Dependency Registry (e.g., Consul)
**Rejected:** Adds external dependency; Qdrant already provides this capability.

### Alternative 4: Flat Naming (`{org}-{domain}-{project}`)
**Rejected:** Loses hierarchical structure; harder to parse and query; ambiguous (is `ahrq-drupal-ahrqgov` one project or three?).

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
| 2026-05-01 | 2.0 | Complete rewrite with org-first hierarchical naming, Mechanism 1+2 relationship mapping, and UGIP Phase 2 enhancement |
| 2026-05-01 | 1.1 | Updated with hierarchical naming convention (Option C: colon-delimited) |
| 2026-05-01 | 1.0 | Initial ADR created |
