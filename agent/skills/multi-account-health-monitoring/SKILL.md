---
name: multi-account-health-monitoring
description: This skill should be used when monitoring infrastructure health across multiple AWS accounts (AHRQGOV, EHC, PSO). Provides one-time comprehensive scans, real-time continuous monitoring with JSON metrics, and structured dashboard exports for incident response, pre-deployment verification, and automated alerting integration. Use when asked to check health of all targets, verify infrastructure status, or setup continuous monitoring across accounts.
---

# Multi-Account Health Monitoring Skill

## Purpose

Monitor infrastructure health across multiple AWS accounts (AHRQGOV, EHC, PSO) with three complementary tools:
1. **One-time comprehensive scans** for quick status checks and incident response
2. **Real-time continuous polling** with JSON metrics for live dashboards and alert systems
3. **Structured dashboard exports** for programmatic integration and detailed reporting

All three tools check the same five services:
- Application Load Balancer (ALB) target group health
- Auto Scaling Group (ASG) capacity and instance health
- RDS database instance availability
- EC2 instance system and instance status checks
- CloudWatch active alarms

## When to Use This Skill

To use this skill, one of these conditions must be true:

1. User asks to **monitor health of infrastructure across accounts** ("check health of all targets", "verify infrastructure status")
2. User needs **quick incident response** ("is everything OK?", "what's down?")
3. User wants to **setup continuous monitoring** ("real-time health check", "feed to dashboard")
4. User requires **pre-deployment verification** ("check health before deployment")
5. User needs **programmatic export** ("export metrics", "integrate with alerting")

## How to Use This Skill

### Step 1: Identify the Use Case

Determine which monitoring pattern fits:

**Pattern A: Quick Status Check (2 minutes)**
```bash
cd scripts
./monitor-health-all-accounts.sh
```
Output: Colored console summary + Markdown report

**Pattern B: Real-Time Monitoring (Background)**
```bash
cd scripts
./monitor-health-realtime.sh 60 &
```
Output: Continuous JSONL metrics to `validation-reports/health-metrics-*.jsonl`

**Pattern C: Programmatic Export**
```bash
cd scripts
python3 monitor-dashboard.py --export-json report.json
```
Output: Structured JSON for downstream processing

**Pattern D: Unified Wrapper (Recommended)**
```bash
cd scripts
./monitor scan          # Full scan
./monitor watch 30      # Real-time (30s intervals)
./monitor export file   # Export to JSON
./monitor dashboard     # Print summary
```

### Step 2: Execute the Appropriate Command

Based on the user's need, run the corresponding command from Step 1.

**Important setup checks:**
- Verify AWS credentials are valid: `aws sts get-caller-identity --profile 406380712964_ct-ahrqgov-dev-role`
- Confirm all three profiles exist: `aws configure list-profiles`
- Ensure jq is installed: `which jq`
- For Python script, verify boto3: `python3 -c "import boto3; print(boto3.__version__)"`

### Step 3: Interpret Results

#### Console Output Interpretation

**Health Status Symbols:**
- `✓ HEALTHY`: All services operational
- `⚠ DEGRADED`: Some services degraded, operational overall
- `✗ UNHEALTHY`: Critical service failure

**Status Details:**
```
✓ AHRQGOV | Status: healthy | Healthy: 15 | Degraded: 0 | Unhealthy: 0
⚠ PSO     | Status: degraded | Healthy: 8 | Degraded: 2 | Unhealthy: 0
  → ALB: 2 unhealthy targets
  → ASG: 1 degraded group
```

#### JSON Output Interpretation

**Metric Status Values:**
- `healthy`: Resource is functioning normally
- `degraded`: Resource is partially impaired but operational
- `unhealthy`: Resource has failed or is non-functional

**Common Queries:**
```bash
# Find all unhealthy resources
jq 'select(.status != "healthy")' validation-reports/health-metrics-*.jsonl

# Count by account
jq '.account' validation-reports/health-metrics-*.jsonl | sort | uniq -c

# Filter by service type
jq 'select(.type == "alb")' validation-reports/health-metrics-*.jsonl
```

### Step 4: Take Action Based on Status

**If HEALTHY:**
- Proceed with planned operations
- Safe to deploy changes
- No remediation needed

**If DEGRADED:**
- Investigate specific failing resource
- Run targeted health check on service with issues
- Assess impact before proceeding
- Example: `jq 'select(.status == "degraded")' report.json`

**If UNHEALTHY:**
- Halt deployments immediately
- Investigate root cause via CloudWatch logs
- Contact infrastructure team
- Example: `aws logs tail /aws/alb/... --follow`

### Step 5: Integration (Optional)

For continuous monitoring, integrate with external systems:

**Cron Scheduling:**
```bash
# Every 5 minutes - comprehensive scan
*/5 * * * * /path/to/scripts/monitor-health-all-accounts.sh >> /var/log/health.log 2>&1
```

**Slack Notifications:**
```bash
# Run check and post unhealthy resources to Slack
python3 scripts/monitor-dashboard.py --export-json /tmp/health.json
unhealthy=$(jq '.metrics | map(select(.status != "healthy")) | length' /tmp/health.json)
if [ "$unhealthy" -gt 0 ]; then
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK \
    -d "{\"text\": \"⚠️ Found $unhealthy unhealthy resources\"}"
fi
```

**CloudWatch Metrics:**
```bash
# Export metrics to CloudWatch custom namespace
python3 scripts/monitor-dashboard.py --export-json /tmp/report.json
jq '.metrics[]' /tmp/report.json | while read metric; do
  aws cloudwatch put-metric-data --namespace "CustomHealth" --metric-data "$metric"
done
```

## Scripts Reference

### [`scripts/monitor`](../../scripts/monitor)
Unified command wrapper providing easy access to all monitoring functions.

**Commands:**
- `./monitor scan` - One-time comprehensive scan
- `./monitor watch [N]` - Real-time monitoring (N-second intervals)
- `./monitor dashboard [ID]` - Print dashboard summary
- `./monitor export <file>` - Export to JSON
- `./monitor logs [N]` - Show last N metrics lines
- `./monitor help` - Show help message

### [`scripts/monitor-health-all-accounts.sh`](../../scripts/monitor-health-all-accounts.sh)
One-time comprehensive health scan across all three accounts.

**Execution:** ~30-60 seconds  
**Output:** Console + Markdown report to `validation-reports/health-check-YYYYMMDD_HHMMSS.md`

### [`scripts/monitor-health-realtime.sh`](../../scripts/monitor-health-realtime.sh)
Continuous polling monitor with JSON Lines output for integration.

**Execution:** Continuous until Ctrl+C  
**Output:** JSONL metrics to `validation-reports/health-metrics-YYYYMMDD.jsonl`  
**Usage:** `./monitor-health-realtime.sh [INTERVAL]` (default: 60 seconds)

### [`scripts/monitor-dashboard.py`](../../scripts/monitor-dashboard.py)
Python-based dashboard with structured JSON export.

**Execution:** ~20-40 seconds  
**Output:** Console summary + JSON export  
**Usage:** `python3 monitor-dashboard.py [--account ID] [--export-json FILE]`

## Accounts & Configuration

Three accounts are pre-configured in `~/.aws/credentials`:

| Account | ID | Profile |
|---------|----|----|
| AHRQGOV | 406380712964 | `406380712964_ct-ahrqgov-dev-role` |
| EHC | 975242026693 | `975242026693_ct-ehc-dev-role` |
| PSO | 225577488556 | `225577488556_ct-pso-dev-role` |

All scripts automatically handle profile switching for cross-account access.

## Services Monitored

### Application Load Balancer (ALB)
- Target group health status
- Healthy vs unhealthy target counts
- Per-target health details

### Auto Scaling Groups (ASG)
- Desired capacity vs running instances
- Instance health status
- Scaling activity state

### RDS Databases
- Instance availability status
- Engine type and version
- Multi-AZ configuration

### EC2 Instances
- System status checks (ok/impaired)
- Instance status checks (ok/impaired)
- Instance type and state

### CloudWatch Alarms
- Active alarms in ALARM state
- State reason and metric details

## Output Locations

Reports and metrics are saved to `validation-reports/`:

- `health-check-*.md` - Markdown reports from one-time scans
- `health-metrics-*.jsonl` - JSON Lines metrics from real-time monitoring
- `*.json` - JSON exports from dashboard

## Troubleshooting

### Credentials Not Found
```bash
aws configure list-profiles
# Should show three profiles matching account IDs
```

### Permission Denied
```bash
aws sts get-caller-identity --profile 406380712964_ct-ahrqgov-dev-role
# Should return account ID 406380712964
```

### Session Token Expired
```bash
# Tokens expire after 1 hour; update credentials in ~/.aws/credentials
# Or use SSO to refresh:
aws sso login --profile 406380712964_ct-ahrqgov-dev-role
```

### Missing Dependencies
```bash
# Install required tools
brew install jq awscli  # macOS
apt-get install jq awscli  # Ubuntu
pip3 install boto3  # Python library
```

## Related Documentation

- **Full Guide:** `scripts/HEALTH-MONITORING-GUIDE.md` (comprehensive 200+ line reference)
- **Quick Reference:** `scripts/HEALTH-MONITORING-QUICKREF.md` (quick commands and examples)
- **Implementation Details:** `scripts/HEALTH-MONITORING-IMPLEMENTATION.md` (architecture and design)
- **Getting Started:** `scripts/README.md` (onboarding guide)

## Examples

### Example 1: Quick Incident Assessment
```bash
cd scripts
./monitor-health-all-accounts.sh
# Output shows which account/service has issues
# Report saved for later analysis
```

### Example 2: Real-Time Dashboard Feed
```bash
cd scripts
./monitor-health-realtime.sh 30 &
# Runs in background, appending metrics every 30 seconds
# Can be piped to Grafana, Datadog, or custom processor
```

### Example 3: Pre-Deployment Health Check
```bash
cd scripts
python3 monitor-dashboard.py --export-json pre-deploy-check.json
jq '.accounts[] | select(.status != "healthy")' pre-deploy-check.json
# If any unhealthy, halt deployment
```

### Example 4: Export Unhealthy Resources
```bash
cd scripts
python3 monitor-dashboard.py --export-json report.json
jq '.metrics[] | select(.status != "healthy") | {account, name, status}' report.json
# Shows all resources needing attention
```

## Key Features

✓ Cross-account monitoring (AHRQGOV, EHC, PSO)  
✓ One-time scans for quick assessment  
✓ Real-time continuous monitoring with JSON output  
✓ Structured dashboard exports for integration  
✓ Five critical services monitored per account  
✓ Colored console output for easy interpretation  
✓ Markdown reports for documentation  
✓ JSONL metrics for streaming and archival  
✓ Automatic profile switching for AWS access  
✓ Graceful error handling and reporting  

## Version & Status

- **Version:** 1.0
- **Status:** Production ready
- **Last Updated:** 2026-09-11
- **Accounts:** AHRQGOV (406380712964), EHC (975242026693), PSO (225577488556)
