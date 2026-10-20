---
name: aws-ecs-troubleshooting
description: >
  This skill provides a structured diagnostic runbook for investigating ECS Fargate tasks
  that are unexpectedly stopping. Use when ECS tasks stop with non-zero exit codes, cycle
  repeatedly, or when service desired count does not match running count. Maps each
  diagnostic step to the specific MCP tool required (aws-ecs, aws-cloudwatch). Applicable to aws-engineer,
  sre, and devops-engineer modes.
---

# AWS ECS Troubleshooting Skill

**Skill ID:** `aws-ecs-troubleshooting`  
**Version:** 1.0.0  
**Category:** Observability / Incident Response  
**Applicable Modes:** `aws-engineer`, `sre`, `devops-engineer`

---

## Overview

This skill provides a structured diagnostic runbook for investigating **ECS Fargate tasks that are unexpectedly stopping**. It maps each diagnostic step to the specific MCP tool required to execute it via the `aws-ecs` and `aws-cloudwatch` MCP servers (proxied through `mcp-proxy`).

Use this skill when:
- ECS tasks are stopping with non-zero exit codes
- ECS tasks are stopping immediately after launch (exit code 1, 137, 139)
- ECS service desired count does not match running count
- ECS tasks are cycling (starting and stopping repeatedly)
- CloudWatch alarms fire on `RunningTaskCount` dropping below threshold

---

## Diagnostic Runbook: ECS Tasks Unexpectedly Stopping

### Step 1: Inspect Task State & Stop Reason

**Objective:** Determine the last known state of the stopped task and retrieve the `stoppedReason` field, which is the single most informative field for triage.

**MCP Tool:** `describe_tasks` (via `aws-ecs` MCP server)

```
mcp_call(
  ref="t:aws-ecs.describe_tasks",
  args={
    "cluster": "<your-cluster-name>",
    "tasks": ["<stopped-task-arn>"]
  }
)
```

**Response includes:**
- `taskArn` — Full ARN of the task
- `lastStatus` — Current status (STOPPED, RUNNING, PENDING, etc.)
- `stopCode` — Machine-readable stop code
- `stoppedReason` — Human-readable reason for stopping
- `containers[].exitCode` — Container exit code
- `containers[].reason` — Container-level stop reason

**Key Fields to Examine:**
- `stoppedReason` — Human-readable reason (e.g., "Essential container in task exited", "Task failed ELB health checks")
- `stopCode` — Machine-readable code: `TaskFailedToStart`, `EssentialContainerExited`, `ServiceSchedulerInitiated`
- `containers[].exitCode` — Container-level exit code (137 = OOM kill, 1 = app error, 139 = segfault)
- `containers[].reason` — Container-level stop reason

**Common `stoppedReason` Values & Meaning:**

| stoppedReason | Root Cause |
|---------------|------------|
| `Essential container in task exited` | App crashed — check CloudWatch logs |
| `Task failed ELB health checks` | Health check endpoint returning non-200 |
| `Cannotpullcontainererror` | ECR auth failure or image not found |
| `ResourceInitializationError` | Secrets Manager / SSM fetch failed at startup |
| `OutOfMemoryError` | Container exceeded memory limit |

---

### Step 2: Retrieve Container Logs from CloudWatch

**Objective:** Pull the last N log events from the container's CloudWatch log stream to identify the application-level error that caused the exit.

**MCP Tool:** `get_log_events` (via `aws-cloudwatch` MCP server)

```
# First, find the log stream
mcp_call(
  ref="t:aws-cloudwatch.describe_log_streams",
  args={
    "log_group_name": "/ecs/<your-service-name>",
    "log_stream_name_prefix": "ecs/<container-name>"
  }
)

# Then retrieve log events
mcp_call(
  ref="t:aws-cloudwatch.get_log_events",
  args={
    "log_group_name": "/ecs/<your-service-name>",
    "log_stream_name": "ecs/<container-name>/<task-id>",
    "limit": 100,
    "start_from_head": true
  }
)
```

**Response includes:**
- `events[]` — Array of log events with `timestamp`, `message`, `ingestionTime`
- `nextToken` — Pagination token for additional events

**What to Look For:**
- Stack traces or unhandled exceptions immediately before exit
- `FATAL` or `ERROR` level log lines
- Database connection failures (`ECONNREFUSED`, `Access denied`)
- Missing environment variables (`undefined`, `null`, `KeyError`)
- OOM indicators (`Killed`, `Cannot allocate memory`)

---

### Step 3: Check ECS Service Events & Deployment Health

**Objective:** Review the ECS service event log to understand the scheduler's perspective — whether tasks are failing to register with the load balancer, failing health checks, or being replaced by a deployment.

**MCP Tool:** `describe_services` (via `aws-ecs` MCP server)

```
mcp_call(
  ref="t:aws-ecs.describe_services",
  args={
    "cluster": "<your-cluster-name>",
    "services": ["<your-service-name>"]
  }
)
```

**Response includes:**
- `desiredCount` — Desired number of running tasks
- `runningCount` — Actual number of running tasks
- `pendingCount` — Tasks in PENDING state
- `status` — Service status (ACTIVE, DRAINING, INACTIVE)
- `events[]` — Chronological scheduler messages

**Key Fields to Examine:**
- `desiredCount` vs `runningCount` — Gap indicates tasks are failing to stay healthy
- `pendingCount` — Tasks stuck in PENDING may indicate resource constraints or image pull failures
- `events[]` — Chronological scheduler messages; look for:
  - `"has started 1 tasks"` followed by `"has stopped 1 tasks"` in rapid succession (crash loop)
  - `"was unable to place a task"` — Capacity or constraint issue
  - `"registered 0 targets"` — Load balancer registration failure

---

### Step 4: Verify Target Group Health (Load Balancer Registration)

**Objective:** Confirm whether stopped tasks were deregistered from the ALB target group due to failed health checks.

**AWS Observability Tool:** `aws elbv2 describe-target-health`

```bash
PROFILE=$(grep -E '^AWS_PROFILE=' .env 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"'"'"' ')
TARGET_GROUP_ARN="<your-target-group-arn>"

aws elbv2 describe-target-health \
  --target-group-arn "$TARGET_GROUP_ARN" \
  --profile "$PROFILE" \
  --region us-east-1 \
  --query 'TargetHealthDescriptions[*].{Target:Target.Id,Port:Target.Port,State:TargetHealth.State,Reason:TargetHealth.Reason,Description:TargetHealth.Description}' \
  --output table
```

**Health States & Meaning:**

| State | Meaning |
|-------|---------|
| `healthy` | Task is passing health checks |
| `unhealthy` | Task is failing health checks — will be deregistered |
| `draining` | Task is being gracefully removed |
| `unused` | Target registered but not receiving traffic |
| `initial` | Health check in progress (normal during startup) |

---

### Step 5: Check CloudWatch Metrics for Resource Exhaustion

**Objective:** Determine if tasks are being killed due to CPU throttling or memory pressure at the service level.

**MCP Tool:** `get_metric_statistics` (via `aws-cloudwatch` MCP server)

```
# Memory utilization
mcp_call(
  ref="t:aws-cloudwatch.get_metric_statistics",
  args={
    "namespace": "AWS/ECS",
    "metric_name": "MemoryUtilization",
    "dimensions": {
      "ClusterName": "<your-cluster-name>",
      "ServiceName": "<your-service-name>"
    },
    "start_time": "2026-05-22T13:00:00Z",
    "end_time": "2026-05-22T14:00:00Z",
    "period": 300,
    "statistics": ["Average", "Maximum"]
  }
)

# CPU utilization
mcp_call(
  ref="t:aws-cloudwatch.get_metric_statistics",
  args={
    "namespace": "AWS/ECS",
    "metric_name": "CPUUtilization",
    "dimensions": {
      "ClusterName": "<your-cluster-name>",
      "ServiceName": "<your-service-name>"
    },
    "start_time": "2026-05-22T13:00:00Z",
    "end_time": "2026-05-22T14:00:00Z",
    "period": 300,
    "statistics": ["Average", "Maximum"]
  }
)
```

---

## Decision Tree: Triage Flow

```
ECS Tasks Stopping
│
├─ stoppedReason = "Essential container in task exited"
│   └─ exitCode = 137 → OOM kill → Increase memory limit in task definition
│   └─ exitCode = 1   → App crash → Check CloudWatch logs (Step 2)
│   └─ exitCode = 139 → Segfault → Check CloudWatch logs (Step 2)
│
├─ stoppedReason = "Task failed ELB health checks"
│   └─ Check target group health (Step 4)
│   └─ Verify health check path returns HTTP 200
│
├─ stoppedReason = "Cannotpullcontainererror"
│   └─ Verify ECR image URI and tag exist
│   └─ Check task execution role has ecr:GetAuthorizationToken
│
├─ stoppedReason = "ResourceInitializationError"
│   └─ Check Secrets Manager / SSM Parameter Store permissions
│   └─ Verify secret ARNs in task definition are correct
│
└─ stoppedReason = "ServiceSchedulerInitiated"
    └─ Deployment in progress — check service events (Step 3)
    └─ May be normal rolling update behavior
```

---

## MCP Integration: Using AWS MCP Tools

This skill uses the `aws-ecs` and `aws-cloudwatch` MCP servers (proxied through `mcp-proxy`). All tool calls use the `mcp_call` function with the format:

```
mcp_call(ref="t:<server>.<tool>", args={...})
```

**Available servers:**
- `aws-ecs` — ECS cluster, service, and task operations
- `aws-cloudwatch` — CloudWatch metrics, logs, and alarms

When executing this skill in a live incident:
1. Complete Steps 1-3 first (read-only, safe to run immediately)
2. Document findings in `.ai-memory/incident-<date>.md`
3. Only proceed to remediation after root cause is confirmed
4. All AWS operations require `AWS_PROFILE` and `AWS_REGION` environment variables

---

## Related Skills

- [`aws-cloudwatch-observability`](../aws-cloudwatch-observability/SKILL.md) — CloudWatch metrics, logs, and alarms
- [`aws-infrastructure`](../aws-infrastructure/SKILL.md) — General AWS infrastructure management

---

## References

- [AWS ECS Troubleshooting Guide](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/troubleshooting.html)
- [ECS Task Stop Codes](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/stopped-task-error-codes.html)
- [CloudWatch Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)
- MCP Servers: `aws-ecs`, `aws-cloudwatch` (via `mcp-proxy`)
- ADR: `.ai-memory/ADR-2026-05-22-aws-agent-toolkit-integration.md`
