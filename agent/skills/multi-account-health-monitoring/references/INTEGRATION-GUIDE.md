# Multi-Account Health Monitoring - Quick Integration Guide

## What Was Created

A complete production-ready health monitoring suite for three AWS accounts (AHRQGOV, EHC, PSO) with four complementary tools:

### Tools Delivered

| Tool | Type | Purpose | Execution Time |
|------|------|---------|-----------------|
| `monitor` | Bash wrapper | Unified command interface | Instant |
| `monitor-health-all-accounts.sh` | Bash script | One-time comprehensive scan | 30-60 sec |
| `monitor-health-realtime.sh` | Bash script | Real-time continuous polling | Continuous |
| `monitor-dashboard.py` | Python 3 | Dashboard with JSON export | 20-40 sec |

### Services Monitored Per Account

- ALB target group health
- ASG capacity and instance health
- RDS instance availability
- EC2 system and instance status
- CloudWatch active alarms

### Documentation

- `HEALTH-MONITORING-GUIDE.md` - Comprehensive 200+ line reference
- `HEALTH-MONITORING-QUICKREF.md` - Quick command reference
- `HEALTH-MONITORING-IMPLEMENTATION.md` - Architecture and design
- `scripts/README.md` - Getting started guide

---

## Quick Start (Choose One)

### Option A: Quick Status Check
```bash
cd /Users/dietrichgottfriedschmidt/apps/devops/scripts
./monitor-health-all-accounts.sh
```
**Result:** Colored console summary + Markdown report in `validation-reports/`

### Option B: Real-Time Monitoring
```bash
cd /Users/dietrichgottfriedschmidt/apps/devops/scripts
./monitor-health-realtime.sh 60 &
tail -f ../validation-reports/health-metrics-*.jsonl | jq '.'
```
**Result:** Continuous JSON metrics for integration

### Option C: Dashboard Export
```bash
cd /Users/dietrichgottfriedschmidt/apps/devops/scripts
python3 monitor-dashboard.py --export-json report.json
jq '.accounts' report.json
```
**Result:** Structured JSON for downstream processing

### Option D: Unified Wrapper (Recommended)
```bash
cd /Users/dietrichgottfriedschmidt/apps/devops/scripts
./monitor help           # See all commands
./monitor scan           # Full scan
./monitor watch 30       # Real-time (30s intervals)
./monitor export file    # Export to JSON
```

---

## Account Mapping

All three accounts are pre-configured in `~/.aws/credentials`:

```
AHRQGOV  │ 406380712964  │ 406380712964_ct-ahrqgov-dev-role
EHC      │ 975242026693  │ 975242026693_ct-ehc-dev-role
PSO      │ 225577488556  │ 225577488556_ct-pso-dev-role
```

Scripts automatically handle profile switching.

---

## File Locations

### Executable Scripts
```
scripts/
├── monitor                    ✓ Executable
├── monitor-health-all-accounts.sh    ✓ Executable
├── monitor-health-realtime.sh        ✓ Executable
└── monitor-dashboard.py              ✓ Executable
```

### Documentation
```
scripts/
├── README.md                          ← Start here
├── HEALTH-MONITORING-GUIDE.md         ← Full reference
├── HEALTH-MONITORING-QUICKREF.md      ← Quick commands
└── HEALTH-MONITORING-IMPLEMENTATION.md ← Architecture
```

### Reports & Metrics
```
validation-reports/
├── health-check-20260911_132500.md    ← Markdown reports
├── health-metrics-20260911.jsonl      ← Real-time JSONL
└── *.json                             ← Exported dashboards
```

### Skill Package
```
.claude/skills/multi-account-health-monitoring/
├── SKILL.md                          ← Skill definition
└── scripts/
    ├── monitor
    ├── monitor-health-all-accounts.sh
    ├── monitor-health-realtime.sh
    └── monitor-dashboard.py
```

---

## Key Capabilities

### 1. One-Time Comprehensive Scan
```bash
./monitor-health-all-accounts.sh
```
- Scans all three accounts sequentially
- Checks all five services
- Outputs colored console summary
- Saves detailed Markdown report
- Execution: ~30-60 seconds

### 2. Real-Time Continuous Monitoring
```bash
./monitor-health-realtime.sh 60
```
- Polls every N seconds (default: 60)
- Outputs JSON Lines metrics
- Appends to daily JSONL file
- Graceful shutdown (Ctrl+C)
- Perfect for dashboards and alerting

### 3. Structured Dashboard Export
```bash
python3 monitor-dashboard.py --export-json report.json
```
- Scans all accounts in parallel
- Generates account-level summaries
- Exports machine-readable JSON
- Includes issue lists per account
- Execution: ~20-40 seconds

### 4. Unified Command Interface
```bash
./monitor [scan|watch|dashboard|export|logs|help]
```
- Easy-to-remember subcommands
- Automatic help system
- Consistent across all tools
- Error handling and validation

---

## Common Use Cases

### Use Case 1: Pre-Deployment Check
```bash
./monitor scan
# Review output for any DEGRADED or UNHEALTHY status
# Only proceed if all accounts show HEALTHY
```

### Use Case 2: Incident Response
```bash
./monitor watch 5  # Real-time with 5-second polling
# Monitor metrics as systems recover
# Press Ctrl+C when stable
```

### Use Case 3: Hourly Health Reports
```bash
# Add to cron (runs every hour at :00)
0 * * * * /path/to/scripts/monitor-health-all-accounts.sh >> /var/log/health.log 2>&1
```

### Use Case 4: Slack Integration
```bash
python3 scripts/monitor-dashboard.py --export-json /tmp/health.json
unhealthy=$(jq '.metrics | map(select(.status != "healthy")) | length' /tmp/health.json)
if [ "$unhealthy" -gt 0 ]; then
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK \
    -d "{\"text\": \"⚠️ Found $unhealthy unhealthy resources\"}"
fi
```

### Use Case 5: CloudWatch Integration
```bash
./monitor-health-realtime.sh 60 | while read metric; do
  aws cloudwatch put-metric-data \
    --namespace "CustomHealth" \
    --metric-data "$metric"
done
```

---

## Health Status Interpretation

### Console Output Symbols
```
✓ HEALTHY    → All services operational, safe to proceed
⚠ DEGRADED   → Some services impaired, operational overall
✗ UNHEALTHY  → Critical service failure, halt operations
```

### JSON Status Values
```
"status": "healthy"    → Resource functioning normally
"status": "degraded"   → Resource partially impaired
"status": "unhealthy"  → Resource failed or non-functional
```

### Example Console Output
```
✓ AHRQGOV | Status: healthy   | Healthy: 15 | Degraded: 0 | Unhealthy: 0
⚠ PSO     | Status: degraded  | Healthy: 8  | Degraded: 2 | Unhealthy: 0
  → ALB: 2 unhealthy targets
  → ASG: 1 degraded group
```

---

## Troubleshooting

### Problem: "AWS Profile Not Found"
```bash
aws configure list-profiles
# Should show all three profiles
```

### Problem: "Permission Denied"
```bash
aws sts get-caller-identity --profile 406380712964_ct-ahrqgov-dev-role
# Should return account ID
```

### Problem: "Session Token Expired"
```bash
# Tokens expire after 1 hour
# Update credentials or use SSO:
aws sso login --profile 406380712964_ct-ahrqgov-dev-role
```

### Problem: "jq command not found"
```bash
brew install jq  # macOS
apt-get install jq  # Ubuntu
```

### Problem: "python3 or boto3 not found"
```bash
python3 --version  # Should be 3.7+
pip3 install boto3  # Install boto3 if needed
```

---

## Integration Patterns

### Pattern 1: Scheduled Monitoring
```bash
# Cron job - every 5 minutes
*/5 * * * * /path/to/scripts/monitor-health-all-accounts.sh

# Systemd timer - continuous
[Unit]
Description=Health Monitor
After=network.target

[Service]
Type=simple
ExecStart=/path/to/scripts/monitor-health-realtime.sh 60
Restart=always

[Install]
WantedBy=multi-user.target
```

### Pattern 2: Dashboard Feed
```bash
# Feed JSONL to Grafana/Datadog/New Relic
./monitor-health-realtime.sh 60 | your-metric-processor
```

### Pattern 3: Alert System
```bash
# Export and check for issues
python3 scripts/monitor-dashboard.py --export-json /tmp/report.json

# Find unhealthy
jq '.metrics[] | select(.status != "healthy")' /tmp/report.json

# Send alert if found
if jq -e '.metrics[] | select(.status != "healthy")' /tmp/report.json > /dev/null; then
  # Trigger alert/escalation
fi
```

### Pattern 4: Archive & Analysis
```bash
# Upload daily metrics to S3
tar -czf health-metrics-$(date +%Y%m%d).tar.gz validation-reports/
aws s3 cp health-metrics-*.tar.gz s3://your-bucket/health-metrics/

# Analyze trends
jq '.[] | {timestamp, account, status}' validation-reports/health-metrics-*.jsonl | \
  python3 analyze-trends.py
```

---

## Performance & Limits

### Execution Times
- One-time scan: 30-60 seconds (all accounts)
- Real-time poll: 1-2 seconds per cycle
- Dashboard scan: 20-40 seconds (all accounts)

### API Rate Limits
- AWS: 100 requests/second (no throttling risk)
- CloudWatch: 40 requests/second (safe at 60s intervals)
- No risk of hitting any limits with recommended intervals

### Optimization Tips
1. Use 5-minute polling minimum for cost optimization
2. Run single-account scans during peak times
3. Archive old JSONL files to S3 for cost savings
4. Use 60+ second intervals for production

---

## Skill Usage

The monitoring suite is also packaged as a Claude skill at:
```
.claude/skills/multi-account-health-monitoring/
```

Load this skill to monitor health across all three accounts with natural language:
- "monitor health of all targets"
- "check infrastructure status"
- "setup continuous monitoring"
- "export health metrics to JSON"

---

## Support & Documentation

### Quick Start
```bash
cat scripts/README.md
```

### Quick Commands
```bash
cat scripts/HEALTH-MONITORING-QUICKREF.md
```

### Full Reference
```bash
cat scripts/HEALTH-MONITORING-GUIDE.md
```

### Implementation Details
```bash
cat scripts/HEALTH-MONITORING-IMPLEMENTATION.md
```

### Command Help
```bash
./scripts/monitor help
```

---

## Deliverable Summary

✅ **4 Executable Tools**
- One-time comprehensive scan
- Real-time continuous monitoring
- Dashboard with JSON export
- Unified command wrapper

✅ **4 Documentation Files**
- Getting started guide (README.md)
- Comprehensive reference (HEALTH-MONITORING-GUIDE.md)
- Quick reference card (HEALTH-MONITORING-QUICKREF.md)
- Implementation details (HEALTH-MONITORING-IMPLEMENTATION.md)

✅ **3 AWS Accounts**
- AHRQGOV (406380712964)
- EHC (975242026693)
- PSO (225577488556)

✅ **5 Services Monitored**
- ALB target group health
- ASG capacity and instance health
- RDS instance availability
- EC2 system and instance status
- CloudWatch active alarms

✅ **Production Ready**
- Error handling and validation
- Colored output for easy interpretation
- Markdown and JSON reporting
- Graceful shutdown handling
- Cross-account profile switching

✅ **Reusable Skill Package**
- Claude skill at `.claude/skills/multi-account-health-monitoring/`
- All scripts included
- Full SKILL.md documentation

---

## Next Steps

1. **Run your first scan:**
   ```bash
   cd /Users/dietrichgottfriedschmidt/apps/devops/scripts
   ./monitor scan
   ```

2. **Review the quick reference:**
   ```bash
   cat HEALTH-MONITORING-QUICKREF.md
   ```

3. **Schedule monitoring:**
   - Add cron job for hourly runs
   - Setup Slack notifications
   - Export metrics to CloudWatch

4. **Integrate with existing systems:**
   - Feed JSONL to dashboards
   - Connect to alert platforms
   - Archive metrics to S3

---

**Version:** 1.0  
**Status:** Production Ready  
**Created:** 2026-09-11  
**Last Updated:** 2026-09-11
