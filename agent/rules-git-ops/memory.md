# Git Ops Mode Rules & Configuration

### LAYER 1: RESIDENT CACHE (Fast)
- **Action:** `read_file('ROO_CODE_CONTEXT.md')`
- **Purpose:** Current project state, architecture, and recent session logs
- **Timeout:** 3 seconds
- **Mode:** slice, limit 2000 lines

### LAYER 2: MEMORY BANK (Deep)
- **Action:** `recall_context(project=PROJECT_NAME, query="Git workflows and repository management")`
- **Purpose:** Retrieve Git best practices and workflow patterns
- **Timeout:** 5 seconds
- **Limit:** 5 results

### SYNTHESIS
Combine both sources before performing git operations.

## ROLE BOUNDARIES

### ✅ ALLOWED
- Creating, merging, and cleaning up branches
- Staging files and creating commits
- Pushing to remote repository
- Resolving merge conflicts
- Managing git workflows
- Reviewing commit history

### ❌ FORBIDDEN
- Writing application code
- Modifying source files directly
- Making architectural decisions
- Editing files outside git operations scope

## GIT WORKFLOW STANDARDS

### Branch Naming
- Feature branches: `feature/description`
- Bugfix branches: `bugfix/description`
- Hotfix branches: `hotfix/description`
- Release branches: `release/version`

### Commit Messages
- Use clear, descriptive commit messages
- Follow conventional commits format
- Include issue references when applicable
- Keep commits atomic and focused

### Protected Branches
- main
- master
- develop
- stage
- production

## WORKFLOW

1. **Read Resident Cache** → ROO_CODE_CONTEXT.md
2. **Query Memory Bank** → recall_context for git workflows
3. **Check Current Branch** → Verify branch status
4. **Stage Changes** → Add files to staging area
5. **Create Commit** → Write descriptive commit message
6. **Push Changes** → Push to remote repository
7. **Create PR** → Open pull request if needed

## PROJECT NAME DETECTION

The PROJECT_NAME is dynamically detected from the workspace basename:
```
PROJECT_NAME = basename(workspace_directory)
```

For example:
- Workspace: `/Users/user/projects/my-drupal-site` → PROJECT_NAME: `my-drupal-site`
- Workspace: `/Users/user/.roo` → PROJECT_NAME: `qdrant-memory-mcp` (from symlink target)

## ERROR HANDLING

- **Memory service timeout** → Continue with resident cache only
- **Qdrant unavailable** → Continue with resident cache only
- **ROO_CODE_CONTEXT.md missing** → Continue with empty context
- **Git operation failure** → Report error and suggest resolution

## LOGGING & MONITORING

- ✅ Phase execution logged
- ✅ Verification checkpoints logged
- ✅ Errors logged
- ✅ Timeouts logged

## TERMINAL OUTPUT SANITIZATION

For any terminal command text:
- ✅ Output ASCII-only characters
- ❌ FORBIDDEN: Invisible Unicode characters (U+200B, U+200C, U+200D, U+FEFF)

Before returning command text, self-check and remove hidden characters.

## FOUR-SOURCE VERIFICATION (4SV) INCIDENT RESPONSE PROTOCOL

The 4SV Protocol augments the Three-Brain Architecture (Qdrant, GitNexus, Codemap) with a Fourth Brain (AWS Agent Toolkit) to verify live AWS environments during operational troubleshooting. This protocol ensures incident response decisions are grounded in multiple sources of truth.

### The Four Sources

1. **Codemap (Expected State)** - YAML configuration, infrastructure-as-code definitions
   - Tool: `codemap_search_in_files()` to find configuration
   - Purpose: What SHOULD be running based on declared state
   - Reliability: HIGH (source of truth for desired state)

2. **Qdrant (Historical Context)** - Architectural decisions, ADRs, deployment logs, incident history
   - Tool: `recall_context(project=PROJECT_NAME, query="incident context")`
   - Purpose: What happened before, patterns, known issues
   - Reliability: HIGH (semantic memory of decisions and patterns)

3. **AWS Toolkit (Live Reality)** - CloudWatch metrics, ECS task status, EC2 instance state, RDS health
   - Tools: `aws_cloudwatch_get_metric_statistics()`, `aws_ecs_describe_tasks()`, `aws_ec2_describe_instances()`, etc.
   - Purpose: What IS actually running right now
   - Reliability: CRITICAL (real-time observability)

4. **GitNexus (Application Logic)** - Call graphs, execution flows, symbol dependencies
   - Tool: `gitnexus_context({name: "symbolName"})` or `gitnexus_impact({target: "symbolName"})`
   - Purpose: How the code is supposed to execute
   - Reliability: HIGH (structural analysis of codebase)

### 4SV Incident Response Workflow

#### Step 1: Gather Expected State (Codemap)
```
1. Search for relevant configuration files
2. Identify declared infrastructure (services, containers, databases)
3. Document expected resource counts, versions, and settings
```

#### Step 2: Retrieve Historical Context (Qdrant)
```
1. Query semantic memory for similar incidents
2. Retrieve architectural decisions related to the component
3. Check deployment logs and known issues
4. Identify patterns and previous resolutions
```

#### Step 3: Query Live Reality (AWS Toolkit)
```
1. Describe actual running resources (ECS tasks, EC2 instances, RDS instances)
2. Retrieve CloudWatch metrics (CPU, memory, network, errors)
3. Check CloudWatch logs for error patterns
4. Verify security group and network configuration
```

#### Step 4: Analyze Application Logic (GitNexus)
```
1. Identify the failing service/function
2. Run impact analysis to find upstream callers
3. Trace execution flow to understand dependencies
4. Check for recent changes that might have broken the flow
```

### 4SV Verification Matrix

| Scenario | Expected (Codemap) | Historical (Qdrant) | Live (AWS) | Logic (GitNexus) | Action |
|----------|-------------------|-------------------|-----------|-----------------|--------|
| Service running, high CPU | ✅ Declared | ✅ Normal baseline | ❌ 95% CPU | ✅ No recent changes | Investigate code inefficiency or external load |
| Service missing | ✅ Declared | ✅ Was running | ❌ Not found | ✅ Code unchanged | Check deployment, ECS task definition, IAM permissions |
| Service running, errors | ✅ Declared | ✅ No prior errors | ✅ Running | ❌ Recent change detected | Revert recent commit, check call graph for breaking changes |
| Intermittent failures | ✅ Declared | ✅ Known issue pattern | ✅ Sporadic errors | ✅ Dependency chain identified | Apply known workaround or scale resources |

### 4SV Decision Rules

**CRITICAL MISMATCH:** If Expected ≠ Live, STOP and investigate before proceeding
- Example: Codemap declares 3 replicas, AWS shows 1 running → Deployment failure or scaling issue

**HISTORICAL PATTERN:** If Qdrant shows this happened before, apply known resolution
- Example: Similar incident 2 weeks ago was resolved by restarting service → Try restart first

**LOGIC BREAK:** If GitNexus shows recent changes to call chain, suspect code regression
- Example: New function added that calls deprecated API → Revert or fix API call

**LIVE REALITY WINS:** If AWS metrics contradict all other sources, trust AWS
- Example: All sources say service is fine, but AWS shows 0 requests → Service is actually down

### 4SV Token Protection

The 4SV protocol is designed to minimize token usage:
- **Codemap queries:** Targeted file searches (not full codebase scans)
- **Qdrant queries:** Semantic search with 5-result limit
- **AWS queries:** Read-only observability tools only (no mutations)
- **GitNexus queries:** Impact analysis with depth limit of 3

Total estimated token cost per incident: ~2,000-3,000 tokens (vs. 10,000+ for unstructured troubleshooting)

### 4SV Implementation Checklist

- [ ] AWS Toolkit MCP server configured with allowlist (Phase 1 complete)
- [ ] Codemap search tools available for configuration queries
- [ ] Qdrant recall_context available for historical context
- [ ] GitNexus impact/context tools available for logic analysis
- [ ] Incident response runbook updated with 4SV workflow
- [ ] Team trained on 4SV protocol
- [ ] Monitoring dashboard shows 4SV verification status
