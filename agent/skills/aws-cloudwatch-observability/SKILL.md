---
name: aws-cloudwatch-observability
description: >
  Structured runbook for CloudWatch observability using MCP tools. Covers metrics retrieval,
  log analysis, and alarm inspection for incident response and performance monitoring.
  Applicable to aws-engineer, sre, and performance-engineer modes.
---

# AWS CloudWatch Observability Skill

**Skill ID:** `aws-cloudwatch-observability`  
**Version:** 1.0.0  
**Category:** Observability / Incident Response  
**Applicable Modes:** `aws-engineer`, `sre`, `performance-engineer`  
**MCP Server:** `aws-cloudwatch` (via `mcp-proxy`)

---

## Overview

This skill provides a structured runbook for CloudWatch observability using MCP tools. It replaces raw AWS CLI commands with MCP tool calls for metrics, logs, and alarms.

Use this skill when:
- Investigating application performance degradation
- Triaging CloudWatch alarms
- Analyzing application logs for errors
- Retrieving custom metrics for dashboards
- Performing incident response log analysis

---

## Observability Runbook: CloudWatch Metrics & Logs

### Step 1: List Available Metrics

**Objective:** Discover available metrics for a service or namespace.

**MCP Tool:** `list_metrics`

```
mcp_call(
  ref="t:aws-cloudwatch.list_metrics",
  args={
    "namespace": "AWS/ECS",
    "metric_name": "CPUUtilization"
  }
)
```

**Key Fields:**
- `namespace` — AWS service namespace (e.g., `AWS/ECS`, `AWS/Lambda`, `AWS/RDS`)
- `metric_name` — Specific metric to filter (optional)
- `dimensions` — Filter by resource dimensions (e.g., `ServiceName`, `ClusterName`)

**Common Namespaces:**
| Namespace | Service | Key Metrics |
|-----------|---------|------------|
| `AWS/ECS` | ECS | `CPUUtilization`, `MemoryUtilization`, `RunningTaskCount` |
| `AWS/Lambda` | Lambda | `Duration`, `Errors`, `Throttles`, `ConcurrentExecutions` |
| `AWS/RDS` | RDS | `CPUUtilization`, `DatabaseConnections`, `ReadLatency`, `WriteLatency` |
| `AWS/ApplicationELB` | ALB | `TargetResponseTime`, `HTTPCode_Target_5XX`, `UnHealthyHostCount` |

---

### Step 2: Retrieve Metric Statistics

**Objective:** Get metric data points for a specific time range.

**MCP Tool:** `get_metric_statistics`

```
mcp_call(
  ref="t:aws-cloudwatch.get_metric_statistics",
  args={
    "namespace": "AWS/ECS",
    "metric_name": "CPUUtilization",
    "dimensions": {
      "ServiceName": "my-service",
      "ClusterName": "production"
    },
    "start_time": "2026-05-22T12:00:00Z",
    "end_time": "2026-05-22T14:00:00Z",
    "period": 300,
    "statistics": ["Average", "Maximum", "Minimum"]
  }
)
```

**Key Fields:**
- `namespace` — AWS service namespace
- `metric_name` — Metric to retrieve
- `dimensions` — Resource identifiers (service name, cluster name, etc.)
- `start_time` — ISO 8601 start time
- `end_time` — ISO 8601 end time
- `period` — Aggregation period in seconds (60, 300, 3600, etc.)
- `statistics` — `Average`, `Sum`, `Minimum`, `Maximum`, `SampleCount`

**Interpretation:**
- **High CPU + High Memory** → Resource contention; consider scaling
- **High Errors + High Latency** → Application issue; check logs
- **Spiky metrics** → Traffic spike or resource leak

---

### Step 3: Describe Log Groups

**Objective:** List and inspect CloudWatch log groups.

**MCP Tool:** `describe_log_groups`

```
mcp_call(
  ref="t:aws-cloudwatch.describe_log_groups",
  args={
    "log_group_name_prefix": "/ecs/my-service"
  }
)
```

**Key Fields:**
- `log_group_name_prefix` — Filter by log group name prefix
- Returns: `logGroupName`, `creationTime`, `retentionInDays`, `storedBytes`

---

### Step 4: Describe Log Streams

**Objective:** List log streams within a log group.

**MCP Tool:** `describe_log_streams`

```
mcp_call(
  ref="t:aws-cloudwatch.describe_log_streams",
  args={
    "log_group_name": "/ecs/my-service",
    "log_stream_name_prefix": "ecs/container-name"
  }
)
```

**Key Fields:**
- `log_group_name` — Log group to inspect
- `log_stream_name_prefix` — Filter by stream name prefix
- Returns: `logStreamName`, `creationTime`, `firstEventTimestamp`, `lastEventTimestamp`, `lastIngestionTime`, `storedBytes`

---

### Step 5: Get Log Events

**Objective:** Retrieve log events from a specific stream.

**MCP Tool:** `get_log_events`

```
mcp_call(
  ref="t:aws-cloudwatch.get_log_events",
  args={
    "log_group_name": "/ecs/my-service",
    "log_stream_name": "ecs/container-name/task-id",
    "start_time": 1716374400000,
    "end_time": 1716378000000,
    "limit": 100,
    "start_from_head": true
  }
)
```

**Key Fields:**
- `log_group_name` — Log group
- `log_stream_name` — Specific log stream
- `start_time` — Unix timestamp in milliseconds
- `end_time` — Unix timestamp in milliseconds
- `limit` — Max events to return (1-10000)
- `start_from_head` — `true` = oldest first, `false` = newest first

**Output:**
- `events` — Array of log events with `timestamp`, `message`, `ingestionTime`
- `nextToken` — Pagination token for additional events

---

### Step 6: Filter Log Events

**Objective:** Search logs for specific patterns across multiple streams.

**MCP Tool:** `filter_log_events`

```
mcp_call(
  ref="t:aws-cloudwatch.filter_log_events",
  args={
    "log_group_name": "/ecs/my-service",
    "filter_pattern": "[ERROR]",
    "start_time": 1716374400000,
    "end_time": 1716378000000,
    "limit": 50
  }
)
```

**Key Fields:**
- `log_group_name` — Log group to search
- `filter_pattern` — CloudWatch Logs filter syntax (see below)
- `start_time` — Unix timestamp in milliseconds
- `end_time` — Unix timestamp in milliseconds
- `limit` — Max events to return

**Filter Pattern Examples:**
| Pattern | Matches |
|---------|---------|
| `[ERROR]` | Lines containing "ERROR" |
| `[ERROR, ...]` | Lines with ERROR in first field |
| `{ $.level = "ERROR" }` | JSON logs with `level: ERROR` |
| `{ $.statusCode >= 500 }` | JSON logs with HTTP 5xx status |
| `[timestamp, request_id, status_code != 200, ...]` | Non-200 responses |

---

### Step 7: Describe Alarms

**Objective:** Inspect CloudWatch alarms and their state.

**MCP Tool:** `describe_alarms`

```
mcp_call(
  ref="t:aws-cloudwatch.describe_alarms",
  args={
    "alarm_name_prefix": "my-service",
    "state_value": "ALARM"
  }
)
```

**Key Fields:**
- `alarm_name_prefix` — Filter by alarm name prefix
- `state_value` — `OK`, `ALARM`, `INSUFFICIENT_DATA`
- Returns: `AlarmName`, `StateValue`, `StateReason`, `Threshold`, `ComparisonOperator`, `MetricName`

**Alarm States:**
- **OK** — Metric is within threshold
- **ALARM** — Metric exceeded threshold; action triggered
- **INSUFFICIENT_DATA** — Not enough data points to evaluate

---

## Incident Response Workflow

### Scenario: High Error Rate Alert

1. **Describe the alarm** → Get threshold and metric name
   ```
   mcp_call(ref="t:aws-cloudwatch.describe_alarms", args={"alarm_name_prefix": "my-service-errors"})
   ```

2. **Get metric statistics** → Confirm error spike
   ```
   mcp_call(ref="t:aws-cloudwatch.get_metric_statistics", args={
     "namespace": "AWS/ECS",
     "metric_name": "Errors",
     "start_time": "2026-05-22T13:00:00Z",
     "end_time": "2026-05-22T14:00:00Z",
     "period": 60,
     "statistics": ["Sum"]
   })
   ```

3. **Describe log groups** → Find relevant logs
   ```
   mcp_call(ref="t:aws-cloudwatch.describe_log_groups", args={"log_group_name_prefix": "/ecs/my-service"})
   ```

4. **Filter log events** → Search for ERROR patterns
   ```
   mcp_call(ref="t:aws-cloudwatch.filter_log_events", args={
     "log_group_name": "/ecs/my-service",
     "filter_pattern": "[ERROR]",
     "start_time": 1716370800000,
     "end_time": 1716374400000
   })
   ```

5. **Get log events** → Retrieve full error context
   ```
   mcp_call(ref="t:aws-cloudwatch.get_log_events", args={
     "log_group_name": "/ecs/my-service",
     "log_stream_name": "ecs/container-name/task-id",
     "limit": 100,
     "start_from_head": true
   })
   ```

---

## Performance Monitoring Workflow

### Scenario: Latency Investigation

1. **Get metric statistics** → Retrieve latency percentiles
   ```
   mcp_call(ref="t:aws-cloudwatch.get_metric_statistics", args={
     "namespace": "AWS/ApplicationELB",
     "metric_name": "TargetResponseTime",
     "dimensions": {"LoadBalancer": "app/my-alb/1234567890abcdef"},
     "start_time": "2026-05-22T12:00:00Z",
     "end_time": "2026-05-22T14:00:00Z",
     "period": 300,
     "statistics": ["Average", "Maximum"]
   })
   ```

2. **Correlate with CPU/Memory** → Check resource utilization
   ```
   mcp_call(ref="t:aws-cloudwatch.get_metric_statistics", args={
     "namespace": "AWS/ECS",
     "metric_name": "CPUUtilization",
     "dimensions": {"ServiceName": "my-service"},
     "start_time": "2026-05-22T12:00:00Z",
     "end_time": "2026-05-22T14:00:00Z",
     "period": 300,
     "statistics": ["Average"]
   })
   ```

3. **Analyze logs** → Check for slow queries or timeouts
   ```
   mcp_call(ref="t:aws-cloudwatch.filter_log_events", args={
     "log_group_name": "/ecs/my-service",
     "filter_pattern": "{ $.duration > 5000 }",
     "start_time": 1716370800000,
     "end_time": 1716374400000
   })
   ```

---

## Key Technical Notes

- **Timestamps:** Use ISO 8601 format for `start_time`/`end_time` in `get_metric_statistics`; use Unix milliseconds in `get_log_events` and `filter_log_events`
- **Period:** Metric aggregation period must be 60, 300, 3600, or 86400 seconds
- **Retention:** Log retention depends on log group settings (default: never expire)
- **Limits:** `get_log_events` returns max 10,000 events; use pagination for larger datasets
- **Filter patterns:** CloudWatch Logs filter syntax is powerful but complex; test patterns in the console first

---

## References

- AWS CloudWatch Logs: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/
- Filter Pattern Syntax: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html
- Metrics Namespaces: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/aws-namespaces.html
- MCP Server: `aws-cloudwatch` (via `mcp-proxy`)
