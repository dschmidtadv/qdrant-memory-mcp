# Project Manifests: AHRQ Organization

These manifests are stored in each project's namespace in Qdrant and declare dependencies, contracts, and project metadata.

---

## ahrq:drupal:ahrqgov Manifest

**Namespace:** `ahrq:drupal:ahrqgov`  
**Tags:** `["manifest", "dependencies", "contracts"]`

```markdown
# Project Manifest: ahrq:drupal:ahrqgov

## Identity
- org: ahrq
- domain: drupal
- project: ahrqgov
- type: drupal-site
- version: 10.2.0
- repository: https://github.com/ahrq/ahrqgov-drupal

## Description
AHRQ.gov main website - Drupal 10 site serving public health information

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
- VPC: required (from ahrq:infra:devops)
- RDS: required (from ahrq:infra:devops)

## Bootstrap Query
At UGIP init, query:
1. recall_context(project="shared:registry", query="ahrq:drupal:ahrqgov relationships")
2. recall_context(project="ahrq:infra:drupal-deploy", query="PHP version Docker image ECS task def")
3. recall_context(project="ahrq:infra:devops", query="VPC RDS ALB endpoints")
4. recall_context(project="ahrq:terraform", query="root module outputs")
```

---

## ahrq:drupal:pso Manifest

**Namespace:** `ahrq:drupal:pso`  
**Tags:** `["manifest", "dependencies", "contracts"]`

```markdown
# Project Manifest: ahrq:drupal:pso

## Identity
- org: ahrq
- domain: drupal
- project: pso
- type: drupal-site
- version: 10.2.0
- repository: https://github.com/ahrq/pso-drupal

## Description
PSO (Patient Safety Organization) site - Drupal 10 site for patient safety initiatives

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
- VPC: required (from ahrq:infra:devops)
- RDS: required (from ahrq:infra:devops)

## Bootstrap Query
At UGIP init, query:
1. recall_context(project="shared:registry", query="ahrq:drupal:pso relationships")
2. recall_context(project="ahrq:infra:drupal-deploy", query="PHP version Docker image ECS task def")
3. recall_context(project="ahrq:infra:devops", query="VPC RDS ALB endpoints")
4. recall_context(project="ahrq:terraform", query="root module outputs")
```

---

## ahrq:drupal:ehc Manifest

**Namespace:** `ahrq:drupal:ehc`  
**Tags:** `["manifest", "dependencies", "contracts"]`

```markdown
# Project Manifest: ahrq:drupal:ehc

## Identity
- org: ahrq
- domain: drupal
- project: ehc
- type: drupal-site
- version: 10.2.0
- repository: https://github.com/ahrq/ehc-drupal

## Description
EHC (Effective Healthcare) site - Drupal 10 site for effective healthcare research

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
- VPC: required (from ahrq:infra:devops)
- RDS: required (from ahrq:infra:devops)

## Bootstrap Query
At UGIP init, query:
1. recall_context(project="shared:registry", query="ahrq:drupal:ehc relationships")
2. recall_context(project="ahrq:infra:drupal-deploy", query="PHP version Docker image ECS task def")
3. recall_context(project="ahrq:infra:devops", query="VPC RDS ALB endpoints")
4. recall_context(project="ahrq:terraform", query="root module outputs")
```

---

## ahrq:infra:drupal-deploy Manifest

**Namespace:** `ahrq:infra:drupal-deploy`  
**Tags:** `["manifest", "dependencies", "contracts"]`

```markdown
# Project Manifest: ahrq:infra:drupal-deploy

## Identity
- org: ahrq
- domain: infra
- project: drupal-deploy
- type: infrastructure
- version: 1.0.0
- repository: https://github.com/ahrq/terraform-drupal-deploy

## Description
Drupal-specific ECS task definitions, ECR repositories, and deployment configuration

## Dependencies
- ahrq:terraform            (outputs: VPC IDs, subnet IDs, security group IDs)
- riva:qdrant               (endpoint: memory service)
- riva:litellm-proxy        (endpoint: LLM proxy)

## Contracts I Enforce
- PHP: 8.3+
- Node: 18+
- Docker base: node:18-alpine
- Qdrant: latest

## Contracts I Depend On
- VPC: required (from ahrq:terraform)
- Subnet IDs: required (from ahrq:terraform)
- Security Groups: required (from ahrq:terraform)
- Qdrant endpoint: required (from riva:qdrant)
- LiteLLM proxy endpoint: required (from riva:litellm-proxy)

## Bootstrap Query
At UGIP init, query:
1. recall_context(project="shared:registry", query="ahrq:infra:drupal-deploy relationships")
2. recall_context(project="ahrq:terraform", query="VPC subnet security group outputs")
3. recall_context(project="riva:qdrant", query="endpoint configuration")
4. recall_context(project="riva:litellm-proxy", query="endpoint configuration")
```

---

## ahrq:infra:devops Manifest

**Namespace:** `ahrq:infra:devops`  
**Tags:** `["manifest", "dependencies", "contracts"]`

```markdown
# Project Manifest: ahrq:infra:devops

## Identity
- org: ahrq
- domain: infra
- project: devops
- type: infrastructure
- version: 1.0.0
- repository: https://github.com/ahrq/terraform-devops

## Description
Core ECS cluster, VPC, RDS, ALB, and networking infrastructure

## Dependencies
- ahrq:terraform            (outputs: root module configuration)

## Contracts I Enforce
- Node: 18+
- MySQL: 8.0+
- Terraform: 1.5+

## Contracts I Depend On
- Terraform: 1.5+ (from ahrq:terraform)

## Bootstrap Query
At UGIP init, query:
1. recall_context(project="shared:registry", query="ahrq:infra:devops relationships")
2. recall_context(project="ahrq:terraform", query="root module outputs")
```

---

## ahrq:terraform Manifest

**Namespace:** `ahrq:terraform`  
**Tags:** `["manifest", "dependencies", "contracts"]`

```markdown
# Project Manifest: ahrq:terraform

## Identity
- org: ahrq
- domain: terraform
- type: infrastructure
- version: 1.0.0
- repository: https://github.com/ahrq/terraform-root

## Description
Terraform root modules - AWS infrastructure as code for AHRQ organization

## Dependencies
- None (root module)

## Contracts I Enforce
- Terraform: 1.5+
- AWS Provider: 5.0+

## Contracts I Depend On
- None

## Bootstrap Query
At UGIP init, query:
1. recall_context(project="shared:registry", query="ahrq:terraform relationships")
```

---

## How to Use These Manifests

### For Drupal Projects (ahrq:drupal:*)

At UGIP Phase 2 initialization:

```typescript
// 1. Query shared registry for relationship map
const relationshipMap = await recall_context({
  project: "shared:registry",
  query: "ahrq:drupal:ahrqgov relationships dependencies"
});

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

### For Infrastructure Projects (ahrq:infra:*)

At UGIP Phase 2 initialization:

```typescript
// 1. Query shared registry for relationship map
const relationshipMap = await recall_context({
  project: "shared:registry",
  query: "ahrq:infra:drupal-deploy relationships dependencies"
});

// 2. Query own project manifest
const manifest = await recall_context({
  project: "ahrq:infra:drupal-deploy",
  tags: ["manifest"],
  query: "dependencies contracts"
});

// 3. Query each dependency
const terraform = await recall_context({
  project: "ahrq:terraform",
  query: "VPC subnet security group outputs"
});

const qdrant = await recall_context({
  project: "riva:qdrant",
  query: "endpoint configuration"
});

// 4. Synthesize all sources
const context = synthesize(
  residentCache,
  relationshipMap,
  manifest,
  terraform,
  qdrant
);
```
