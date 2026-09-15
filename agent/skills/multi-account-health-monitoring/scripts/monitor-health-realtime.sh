#!/bin/bash
################################################################################
# Real-time Health Monitor with JSON Output
# Polls health status every N seconds and outputs JSON for dashboards/alerts
# Accounts: AHRQGOV (406380712964), EHC (975242026693), PSO (225577488556)
################################################################################

set -euo pipefail

# Configuration
POLL_INTERVAL="${1:-60}"  # Seconds between polls (default: 60)
OUTPUT_FORMAT="${2:-json}"  # json or text
ACCOUNT_IDS=("406380712964" "975242026693" "225577488556")
ACCOUNT_NAMES=("AHRQGOV" "EHC" "PSO")
PROFILES=("406380712964_ct-ahrqgov-dev-role" "975242026693_ct-ehc-dev-role" "225577488556_ct-pso-dev-role")

METRICS_FILE="validation-reports/health-metrics-$(date +%Y%m%d).jsonl"
mkdir -p validation-reports

###############################################################################
# JSON Output Helpers
###############################################################################

# Generate JSON for a single metric
emit_metric() {
    local timestamp="$1"
    local account="$2"
    local metric_type="$3"
    local metric_name="$4"
    local value="$5"
    local status="$6"  # healthy, degraded, unhealthy
    local details="${7:-}"
    
    local json=$(cat <<EOF
{
  "timestamp": "$timestamp",
  "account": "$account",
  "type": "$metric_type",
  "name": "$metric_name",
  "value": $value,
  "status": "$status"
  $([ -n "$details" ] && echo "," || echo "")$([ -n "$details" ] && echo "\"details\": $details" || echo "")
}
EOF
    )
    
    if [ "$OUTPUT_FORMAT" = "json" ]; then
        echo "$json" | tee -a "$METRICS_FILE"
    fi
}

# Check ALB target group health (JSON output)
check_alb_json() {
    local account_id="$1"
    local account_name="$2"
    local profile="$3"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    export AWS_PROFILE="$profile"
    
    local tgs=$(aws elbv2 describe-target-groups \
        --region us-east-1 \
        --query 'TargetGroups[*].[TargetGroupArn,TargetGroupName]' \
        --output text 2>/dev/null || echo "")
    
    local total_healthy=0
    local total_unhealthy=0
    local total_targets=0
    
    while IFS=$'\t' read -r tg_arn tg_name; do
        if [ -z "$tg_arn" ]; then continue; fi
        
        local health=$(aws elbv2 describe-target-health \
            --target-group-arn "$tg_arn" \
            --region us-east-1 \
            --output json 2>/dev/null || echo '{"TargetHealthDescriptions":[]}')
        
        local targets=$(echo "$health" | jq '.TargetHealthDescriptions | length')
        local healthy=$(echo "$health" | jq '[.TargetHealthDescriptions[] | select(.TargetHealth.State == "healthy")] | length')
        local unhealthy=$(echo "$health" | jq '[.TargetHealthDescriptions[] | select(.TargetHealth.State != "healthy")] | length')
        
        total_targets=$((total_targets + targets))
        total_healthy=$((total_healthy + healthy))
        total_unhealthy=$((total_unhealthy + unhealthy))
        
        local status="healthy"
        [ "$unhealthy" -gt 0 ] && status="degraded"
        
        emit_metric "$timestamp" "$account_name" "alb" "$tg_name" "$healthy" "$status" \
            "{\"total\": $targets, \"unhealthy\": $unhealthy}"
    done <<< "$tgs"
    
    unset AWS_PROFILE
}

# Check ASG health (JSON output)
check_asg_json() {
    local account_id="$1"
    local account_name="$2"
    local profile="$3"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    export AWS_PROFILE="$profile"
    
    local asgs=$(aws autoscaling describe-auto-scaling-groups \
        --region us-east-1 \
        --query 'AutoScalingGroups[*].[AutoScalingGroupName,MinSize,DesiredCapacity,Instances | length(@)]' \
        --output text 2>/dev/null || echo "")
    
    while IFS=$'\t' read -r asg_name min_size desired_capacity running_count; do
        if [ -z "$asg_name" ]; then continue; fi
        
        local health_details=$(aws autoscaling describe-auto-scaling-groups \
            --auto-scaling-group-names "$asg_name" \
            --region us-east-1 \
            --query 'AutoScalingGroups[0].Instances[*].[HealthStatus]' \
            --output text 2>/dev/null || echo "")
        
        local healthy=0
        local unhealthy=0
        while read -r health_status; do
            [ "$health_status" = "Healthy" ] && healthy=$((healthy + 1)) || unhealthy=$((unhealthy + 1))
        done <<< "$health_details"
        
        local status="healthy"
        [ "$unhealthy" -gt 0 ] && status="degraded"
        [ "$running_count" -lt "$desired_capacity" ] && status="degraded"
        
        emit_metric "$timestamp" "$account_name" "asg" "$asg_name" "$healthy" "$status" \
            "{\"desired\": $desired_capacity, \"running\": $running_count, \"unhealthy\": $unhealthy}"
    done <<< "$asgs"
    
    unset AWS_PROFILE
}

# Check RDS health (JSON output)
check_rds_json() {
    local account_id="$1"
    local account_name="$2"
    local profile="$3"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    export AWS_PROFILE="$profile"
    
    local rds=$(aws rds describe-db-instances \
        --region us-east-1 \
        --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus,Engine]' \
        --output text 2>/dev/null || echo "")
    
    while IFS=$'\t' read -r db_id db_status engine; do
        if [ -z "$db_id" ]; then continue; fi
        
        local status="unhealthy"
        [ "$db_status" = "available" ] && status="healthy"
        
        emit_metric "$timestamp" "$account_name" "rds" "$db_id" "1" "$status" \
            "{\"db_status\": \"$db_status\", \"engine\": \"$engine\"}"
    done <<< "$rds"
    
    unset AWS_PROFILE
}

# Check EC2 health (JSON output)
check_ec2_json() {
    local account_id="$1"
    local account_name="$2"
    local profile="$3"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    export AWS_PROFILE="$profile"
    
    local instances=$(aws ec2 describe-instances \
        --region us-east-1 \
        --filters "Name=instance-state-name,Values=running" \
        --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,InstanceStatus.Status,SystemStatus.Status]' \
        --output text 2>/dev/null || echo "")
    
    local healthy_count=0
    local unhealthy_count=0
    
    while IFS=$'\t' read -r instance_id instance_type instance_status sys_status; do
        if [ -z "$instance_id" ]; then continue; fi
        
        local status="healthy"
        if [ "$instance_status" != "ok" ] || [ "$sys_status" != "ok" ]; then
            status="degraded"
            unhealthy_count=$((unhealthy_count + 1))
        else
            healthy_count=$((healthy_count + 1))
        fi
        
        emit_metric "$timestamp" "$account_name" "ec2" "$instance_id" "1" "$status" \
            "{\"type\": \"$instance_type\", \"instance_status\": \"$instance_status\", \"system_status\": \"$sys_status\"}"
    done <<< "$instances"
    
    unset AWS_PROFILE
}

# Check CloudWatch alarms (JSON output)
check_alarms_json() {
    local account_id="$1"
    local account_name="$2"
    local profile="$3"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    export AWS_PROFILE="$profile"
    
    local alarms=$(aws cloudwatch describe-alarms \
        --region us-east-1 \
        --state-value ALARM \
        --query 'MetricAlarms[*].[AlarmName,StateValue,StateReason]' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$alarms" ]; then
        while IFS=$'\t' read -r alarm_name state reason; do
            if [ -z "$alarm_name" ]; then continue; fi
            emit_metric "$timestamp" "$account_name" "cloudwatch_alarm" "$alarm_name" "1" "unhealthy" \
                "{\"state\": \"$state\", \"reason\": \"$reason\"}"
        done <<< "$alarms"
    fi
    
    unset AWS_PROFILE
}

###############################################################################
# Main Monitoring Loop
###############################################################################

main() {
    echo "Starting real-time health monitoring..."
    echo "Poll interval: ${POLL_INTERVAL}s"
    echo "Output format: ${OUTPUT_FORMAT}"
    echo "Metrics file: ${METRICS_FILE}"
    echo ""
    
    local poll_count=0
    
    while true; do
        poll_count=$((poll_count + 1))
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Poll #$poll_count - Checking all accounts..."
        
        for i in "${!ACCOUNT_IDS[@]}"; do
            local account_id="${ACCOUNT_IDS[$i]}"
            local account_name="${ACCOUNT_NAMES[$i]}"
            local profile="${PROFILES[$i]}"
            
            echo "  → $account_name ($account_id)"
            
            check_alb_json "$account_id" "$account_name" "$profile"
            check_asg_json "$account_id" "$account_name" "$profile"
            check_rds_json "$account_id" "$account_name" "$profile"
            check_ec2_json "$account_id" "$account_name" "$profile"
            check_alarms_json "$account_id" "$account_name" "$profile"
        done
        
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Poll #$poll_count complete. Next poll in ${POLL_INTERVAL}s..."
        echo ""
        
        sleep "$POLL_INTERVAL"
    done
}

# Trap signals for graceful shutdown
cleanup() {
    echo ""
    echo "Monitoring stopped. Final metrics saved to: $METRICS_FILE"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Run main
main "$@"
