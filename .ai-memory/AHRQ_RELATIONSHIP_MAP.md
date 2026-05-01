# AHRQ Project Relationship Map & Contracts

**Namespace:** `shared:registry`  
**Tags:** `["relationship-map", "ahrq", "contracts"]`  
**Last Updated:** 2026-05-01  
**Owner:** Infrastructure Team

---

## Projects

| Project | Type | Description | Owner |
|---------|------|-------------|-------|
| `ahrq:drupal:ahrqgov` | Drupal Site | AHRQ.gov main website | Content Team |
| `ahrq:drupal:pso` | Drupal Site | PSO (Patient Safety Organization) site | PSO Team |
| `ahrq:drupal:ehc` | Drupal Site | EHC (Effective Healthcare) site | EHC Team |
| `ahrq:terraform` | Infrastructure | Terraform root modules | Infrastructure Team |
| `ahrq:infra:devops` | Infrastructure | Core ECS, VPC, RDS, ALB | Infrastructure Team |
| `ahrq:infra:drupal-deploy` | Infrastructure | Drupal-specific ECS task defs, ECR | Infrastructure Team |

---

## Relationships & Dependencies

### ahrq:drupal:ahrqgov
**Type:** Drupal Site  
**Depends On:**
- `ahrq:infra:drupal-deploy` — ECS task definition, ECR image tag, PHP version
- `ahrq:infra:devops` — VPC, RDS endpoint, ALB, security groups
- `ahrq:terraform` — Subnet IDs, security group IDs, RDS endpoint

**Contracts Enforced:**
- PHP: 8.3+
- Drupal: 10.x
- MySQL: 8.0+
- Qdrant: latest

---

### ahrq:drupal:pso
**Type:** Drupal Site  
**Depends On:**
- `ahrq:infra:drupal-deploy` — ECS task definition, ECR image tag, PHP version
- `ahrq:infra:devops` — VPC, RDS endpoint, ALB, security groups
- `ahrq:terraform` — Subnet IDs, security group IDs, RDS endpoint

**Contracts Enforced:**
- PHP: 8.3+
- Drupal: 10.x
- MySQL: 8.0+
- Qdrant: latest

---

### ahrq:drupal:ehc
**Type:** Drupal Site  
**Depends On:**
- `ahrq:infra:drupal-deploy` — ECS task definition, ECR image tag, PHP version
- `ahrq:infra:devops` — VPC, RDS endpoint, ALB, security groups
- `ahrq:terraform` — Subnet IDs, security group IDs, RDS endpoint

**Contracts Enforced:**
- PHP: 8.3+
- Drupal: 10.x
- MySQL: 8.0+
- Qdrant: latest

---

### ahrq:infra:drupal-deploy
**Type:** Infrastructure  
**Depends On:**
- `ahrq:terraform` — VPC IDs, subnet IDs, security group IDs
- `riva:qdrant` — Memory service endpoint, API key
- `riva:litellm-proxy` — LLM proxy endpoint, API key

**Contracts Enforced:**
- PHP: 8.3+
- Node: 18+
- Docker base: node:18-alpine
- Qdrant: latest

---

### ahrq:infra:devops
**Type:** Infrastructure  
**Depends On:**
- `ahrq:terraform` — Root module outputs (VPC, subnet, security group IDs)

**Contracts Enforced:**
- Node: 18+
- MySQL: 8.0+
- Terraform: 1.5+

---

### ahrq:terraform
**Type:** Infrastructure  
**Depends On:**
- None (root module)

**Contracts Enforced:**
- Terraform: 1.5+
- AWS Provider: 5.0+

---

## Contracts (Enforced by Owner)

### PHP Version
- **Owner:** `ahrq:infra:drupal-deploy`
- **Requirement:** 8.3+
- **Enforced In:** Docker image tag, ECS task definition
- **Consumers:** `ahrq:drupal:ahrqgov`, `ahrq:drupal:pso`, `ahrq:drupal:ehc`

### Node Version
- **Owner:** `ahrq:infra:devops`
- **Requirement:** 18+
- **Enforced In:** Lambda functions, ECS task definitions
- **Consumers:** `ahrq:infra:drupal-deploy`

### Drupal Version
- **Owner:** `ahrq:drupal:ahrqgov`
- **Requirement:** 10.x
- **Enforced In:** composer.json, Drupal core
- **Consumers:** None (enforced internally)

### MySQL Version
- **Owner:** `ahrq:infra:devops`
- **Requirement:** 8.0+
- **Enforced In:** RDS parameter group
- **Consumers:** `ahrq:drupal:ahrqgov`, `ahrq:drupal:pso`, `ahrq:drupal:ehc`

### Qdrant Version
- **Owner:** `riva:qdrant`
- **Requirement:** latest
- **Enforced In:** Docker image tag
- **Consumers:** `ahrq:infra:drupal-deploy`, all Drupal sites

### Docker Base Image
- **Owner:** `ahrq:infra:drupal-deploy`
- **Requirement:** node:18-alpine
- **Enforced In:** Dockerfile
- **Consumers:** None (enforced internally)

### Terraform Version
- **Owner:** `ahrq:terraform`
- **Requirement:** 1.5+
- **Enforced In:** terraform.required_version
- **Consumers:** `ahrq:infra:devops`, `ahrq:infra:drupal-deploy`

---

## Dependency Graph (ASCII)

```
ahrq:drupal:ahrqgov  ──┐
ahrq:drupal:pso      ──┼──> ahrq:infra:drupal-deploy ──┐
ahrq:drupal:ehc      ──┘                                 │
                                                         ├──> ahrq:terraform
                        ahrq:infra:devops ──────────────┘
                                  ▲
                                  │
                        ahrq:infra:drupal-deploy
                                  │
                        ┌─────────┼─────────┐
                        │         │         │
                   riva:qdrant    │    riva:litellm-proxy
                                  │
                        ahrq:terraform
```

---

## Querying This Registry

### Discover dependencies for a specific project
```
recall_context(
  project="shared:registry",
  query="ahrq:drupal:ahrqgov relationships dependencies"
)
```

### Discover all contracts
```
recall_context(
  project="shared:registry",
  query="contracts PHP version MySQL Qdrant"
)
```

### Discover contract owner
```
recall_context(
  project="shared:registry",
  query="PHP 8.3 owner enforced"
)
```

---

## Maintenance

**Update Frequency:** When dependencies or contracts change  
**Last Reviewed:** 2026-05-01  
**Next Review:** 2026-06-01

**To Update:**
1. Modify this document
2. Store in Qdrant with `memorize_context(project="shared:registry", tags=["relationship-map", "ahrq"], ...)`
3. Notify all dependent projects of changes
4. Update project manifests in each project namespace
