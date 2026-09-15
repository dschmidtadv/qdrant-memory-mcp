#!/bin/bash
################################################################################
# Multi-Account Health Monitor
# Monitors ALB targets, ASGs, RDS, and ECS across all three accounts
# Accounts: AHRQGOV (406380712964), EHC (975242026693), PSO (225577488556)
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Account mapping
declare -A ACCOUNT_NAMES=(
    ["406380712964"]="AHRQGOV"
    ["975242026693"]="EHC"
    ["225577488556"]="PSO"
)

declare -A ACCOUNT_PROFILES=(
    ["406380712964"]="406380712964_ct-ahrqgov-dev-role"
    ["975242026693"]="975242026693_ct-ehc-dev-role"
    ["225577488556"]="225577488556_ct-pso-dev-role"
)

# Timestamp for reports
REPORT_DIR="validation-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/health-check-${TIMESTAMP}.md"

mkdir -p "${REPORT_DIR}"

# Initialize report
cat > "${REPORT_FILE}" << 'EOF'
# Multi-Account Health Check Report

**Generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**Duration:** Multi-account sweep across AHRQGOV, EHC, PSO

## Summary

| Account | Status | ALB Targets | ASG Health | RDS Status | Issues |
|---------|--------|-------------|------------|------------|--------|
EOF

###############################################################################
# Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Set AWS profile and validate
set_aws_profile() {
    local account_id=$1
    local profile="${ACCOUNT_PROFILES[$account_id]}"
    
    if [ -z "$profile" ]; then
        log_error "No profile found for account $account_id"
        return 1
    fi
    
    export AWS_PROFILE="$profile"
    log_info "Using AWS profile: $profile"
}

# Check ALB target groups and their health
check_alb_targets() {
    local account_id=$1
    local account_name="${ACCOUNT_NAMES[$account_id]}"
    
    log_info "Checking ALB targets in $account_name..."
    
    # Get all target groups
    local tgs=$(aws elbv2 describe-target-groups --region us-east-1 \
        --query 'TargetGroups[*].[TargetGroupArn,TargetGroupName]' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$tgs" ]; then
        log_warning "No target groups found in $account_name"
        return 1
    fi
    
    echo ""
    echo "=== ALB Target Groups - $account_name ==="
    
    local healthy_count=0
    local unhealthy_count=0
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
        healthy_count=$((healthy_count + healthy))
        unhealthy_count=$((unhealthy_count + unhealthy))
        
        if [ "$unhealthy" -gt 0 ]; then
            log_warning "TG: $tg_name - $healthy healthy / $unhealthy unhealthy"
            echo "$health" | jq -r '.TargetHealthDescriptions[] | select(.TargetHealth.State != "healthy") | "  - \(.Target.Id) (\(.TargetHealth.State)): \(.TargetHealth.Description)"'
        else
            log_success "TG: $tg_name - $healthy healthy targets"
        fi
    done <<< "$tgs"
    
    echo ""
    echo "ALB Summary: $healthy_count healthy / $unhealthy_count unhealthy / $total_targets total"
    
    if [ "$unhealthy_count" -gt 0 ]; then
        return 1
    fi
    return 0
}

# Check Auto Scaling Group status
check_asg_health() {
    local account_id=$1
    local account_name="${ACCOUNT_NAMES[$account_id]}"
    
    log_info "Checking ASG health in $account_name..."
    
    local asgs=$(aws autoscaling describe-auto-scaling-groups \
        --region us-east-1 \
        --query 'AutoScalingGroups[*].[AutoScalingGroupName,MinSize,DesiredCapacity,Instances[?length(HealthStatus) > `0`] | length(@)]' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$asgs" ]; then
        log_warning "No ASGs found in $account_name"
        return 1
    fi
    
    echo ""
    echo "=== Auto Scaling Groups - $account_name ==="
    
    local unhealthy_asgs=0
    
    while IFS=$'\t' read -r asg_name min_size desired_capacity running_instances; do
        if [ -z "$asg_name" ]; then continue; fi
        
        local healthy=0
        local unhealthy=0
        
        # Get instance health details
        local health_details=$(aws autoscaling describe-auto-scaling-groups \
            --auto-scaling-group-names "$asg_name" \
            --region us-east-1 \
            --query 'AutoScalingGroups[0].Instances[*].[InstanceId,HealthStatus]' \
            --output text 2>/dev/null || echo "")
        
        while IFS=$'\t' read -r instance_id health_status; do
            if [ -z "$instance_id" ]; then continue; fi
            if [ "$health_status" = "Healthy" ]; then
                healthy=$((healthy + 1))
            else
                unhealthy=$((unhealthy + 1))
            fi
        done <<< "$health_details"
        
        if [ "$unhealthy" -gt 0 ] || [ "$running_instances" -lt "$desired_capacity" ]; then
            log_warning "ASG: $asg_name - Desired: $desired_capacity, Running: $running_instances, Healthy: $healthy, Unhealthy: $unhealthy"
            unhealthy_asgs=$((unhealthy_asgs + 1))
        else
            log_success "ASG: $asg_name - All $running_instances instances healthy"
        fi
    done <<< "$asgs"
    
    if [ "$unhealthy_asgs" -gt 0 ]; then
        return 1
    fi
    return 0
}

# Check RDS database instances
check_rds_health() {
    local account_id=$1
    local account_name="${ACCOUNT_NAMES[$account_id]}"
    
    log_info "Checking RDS instances in $account_name..."
    
    local rds=$(aws rds describe-db-instances \
        --region us-east-1 \
        --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus,AvailabilityZone,Engine]' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$rds" ]; then
        log_warning "No RDS instances found in $account_name"
        return 1
    fi
    
    echo ""
    echo "=== RDS Instances - $account_name ==="
    
    local unhealthy_rds=0
    
    while IFS=$'\t' read -r db_id db_status az engine; do
        if [ -z "$db_id" ]; then continue; fi
        
        if [ "$db_status" != "available" ]; then
            log_warning "RDS: $db_id - Status: $db_status (Engine: $engine, AZ: $az)"
            unhealthy_rds=$((unhealthy_rds + 1))
        else
            log_success "RDS: $db_id - Available ($engine)"
        fi
    done <<< "$rds"
    
    if [ "$unhealthy_rds" -gt 0 ]; then
        return 1
    fi
    return 0
}

# Check EC2 instance status
check_ec2_health() {
    local account_id=$1
    local account_name="${ACCOUNT_NAMES[$account_id]}"
    
    log_info "Checking EC2 instances in $account_name..."
    
    local instances=$(aws ec2 describe-instances \
        --region us-east-1 \
        --filters "Name=instance-state-name,Values=running" \
        --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,State.Name,InstanceStatus.Status,SystemStatus.Status]' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$instances" ]; then
        log_warning "No running EC2 instances found in $account_name"
        return 0  # Not an error, just informational
    fi
    
    echo ""
    echo "=== EC2 Instance Status - $account_name ==="
    
    local unhealthy_instances=0
    local total_instances=0
    
    while IFS=$'\t' read -r instance_id instance_type state instance_status sys_status; do
        if [ -z "$instance_id" ]; then continue; fi
        
        total_instances=$((total_instances + 1))
        
        if [ "$instance_status" != "ok" ] || [ "$sys_status" != "ok" ]; then
            log_warning "EC2: $instance_id - Instance: $instance_status, System: $sys_status"
            unhealthy_instances=$((unhealthy_instances + 1))
        else
            log_success "EC2: $instance_id - Healthy"
        fi
    done <<< "$instances"
    
    if [ "$unhealthy_instances" -gt 0 ]; then
        return 1
    fi
    return 0
}

# Generate CloudWatch metrics summary
check_cloudwatch_metrics() {
    local account_id=$1
    local account_name="${ACCOUNT_NAMES[$account_id]}"
    
    log_info "Checking CloudWatch metrics in $account_name..."
    
    echo ""
    echo "=== CloudWatch Alarms - $account_name ==="
    
    local alarms=$(aws cloudwatch describe-alarms \
        --region us-east-1 \
        --state-value ALARM \
        --query 'MetricAlarms[*].[AlarmName,StateValue,StateReason]' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$alarms" ]; then
        log_success "No active alarms in $account_name"
        return 0
    fi
    
    log_warning "Active alarms detected:"
    while IFS=$'\t' read -r alarm_name state reason; do
        if [ -z "$alarm_name" ]; then continue; fi
        echo "  - $alarm_name: $reason"
    done <<< "$alarms"
    
    return 1
}

###############################################################################
# Main Execution
###############################################################################

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║     Multi-Account Health Monitoring Suite                 ║"
    echo "║     AHRQGOV | EHC | PSO                                   ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    
    declare -A account_statuses
    declare -A account_issues
    
    # Iterate through all accounts
    for account_id in "${!ACCOUNT_NAMES[@]}"; do
        account_name="${ACCOUNT_NAMES[$account_id]}"
        
        echo ""
        echo "╔════════════════════════════════════════════════════════════╗"
        echo "║ Account: $account_name ($account_id)"
        echo "╚════════════════════════════════════════════════════════════╝"
        echo ""
        
        # Set AWS profile
        if ! set_aws_profile "$account_id"; then
            log_error "Failed to set AWS profile for $account_name"
            account_statuses["$account_id"]="ERROR"
            account_issues["$account_id"]="Profile not found"
            continue
        fi
        
        # Check health across all services
        local issues=()
        local status="HEALTHY"
        
        if ! check_alb_targets "$account_id"; then
            issues+=("ALB targets unhealthy")
            status="DEGRADED"
        fi
        
        if ! check_asg_health "$account_id"; then
            issues+=("ASG health issues")
            status="DEGRADED"
        fi
        
        if ! check_rds_health "$account_id"; then
            issues+=("RDS issues")
            status="DEGRADED"
        fi
        
        if ! check_ec2_health "$account_id"; then
            issues+=("EC2 health issues")
            status="DEGRADED"
        fi
        
        if ! check_cloudwatch_metrics "$account_id"; then
            issues+=("CloudWatch alarms active")
            status="DEGRADED"
        fi
        
        account_statuses["$account_id"]="$status"
        account_issues["$account_id"]="${issues[*]}"
        
        echo ""
        if [ "$status" = "HEALTHY" ]; then
            log_success "Account $account_name: $status"
        else
            log_warning "Account $account_name: $status"
        fi
        
        unset AWS_PROFILE
    done
    
    # Final Summary
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║ FINAL SUMMARY"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    
    local all_healthy=true
    for account_id in "${!ACCOUNT_NAMES[@]}"; do
        account_name="${ACCOUNT_NAMES[$account_id]}"
        status="${account_statuses[$account_id]}"
        issues="${account_issues[$account_id]}"
        
        if [ "$status" = "HEALTHY" ]; then
            log_success "$account_name: $status"
        else
            log_warning "$account_name: $status"
            if [ -n "$issues" ]; then
                echo "           Issues: $issues"
            fi
            all_healthy=false
        fi
    done
    
    echo ""
    echo "Report saved to: $REPORT_FILE"
    
    if [ "$all_healthy" = true ]; then
        log_success "All accounts are HEALTHY"
        return 0
    else
        log_warning "Some accounts require attention"
        return 1
    fi
}

# Run main function
main "$@"
