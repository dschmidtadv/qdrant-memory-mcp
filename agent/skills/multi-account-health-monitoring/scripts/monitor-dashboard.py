#!/usr/bin/env python3
"""
Multi-Account Health Dashboard
Provides comprehensive health monitoring and alerting for AHRQGOV, EHC, and PSO accounts.
Supports CloudWatch integration, Slack notifications, and JSON export.
"""

import json
import boto3
import argparse
import sys
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from enum import Enum


class HealthStatus(Enum):
    """Health status enumeration"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthMetric:
    """Individual health metric"""
    timestamp: str
    account: str
    metric_type: str
    name: str
    value: float
    status: str
    details: Optional[Dict] = None


@dataclass
class AccountHealth:
    """Account-level health summary"""
    account_id: str
    account_name: str
    status: str
    metrics_count: int
    healthy_count: int
    degraded_count: int
    unhealthy_count: int
    issues: List[str]


class MultiAccountHealthMonitor:
    """Monitor health across multiple AWS accounts"""
    
    ACCOUNTS = {
        "406380712964": {
            "name": "AHRQGOV",
            "profile": "406380712964_ct-ahrqgov-dev-role",
            "region": "us-east-1"
        },
        "975242026693": {
            "name": "EHC",
            "profile": "975242026693_ct-ehc-dev-role",
            "region": "us-east-1"
        },
        "225577488556": {
            "name": "PSO",
            "profile": "225577488556_ct-pso-dev-role",
            "region": "us-east-1"
        }
    }
    
    def __init__(self):
        self.metrics: List[HealthMetric] = []
        self.account_health: Dict[str, AccountHealth] = {}
        
    def create_session(self, account_id: str) -> boto3.Session:
        """Create AWS session for account"""
        profile = self.ACCOUNTS[account_id]["profile"]
        return boto3.Session(profile_name=profile)
    
    def check_alb_targets(self, account_id: str) -> Tuple[List[HealthMetric], int, int, int]:
        """Check ALB target group health"""
        metrics = []
        account_name = self.ACCOUNTS[account_id]["name"]
        region = self.ACCOUNTS[account_id]["region"]
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        try:
            session = self.create_session(account_id)
            elbv2 = session.client("elbv2", region_name=region)
            
            # Get all target groups
            tg_response = elbv2.describe_target_groups()
            total_targets = 0
            total_healthy = 0
            total_unhealthy = 0
            
            for tg in tg_response.get("TargetGroups", []):
                tg_arn = tg["TargetGroupArn"]
                tg_name = tg["TargetGroupName"]
                
                # Get target health
                health_response = elbv2.describe_target_health(TargetGroupArn=tg_arn)
                targets = health_response.get("TargetHealthDescriptions", [])
                
                healthy = sum(1 for t in targets if t["TargetHealth"]["State"] == "healthy")
                unhealthy = len(targets) - healthy
                
                total_targets += len(targets)
                total_healthy += healthy
                total_unhealthy += unhealthy
                
                status = HealthStatus.HEALTHY.value
                if unhealthy > 0:
                    status = HealthStatus.DEGRADED.value
                
                metric = HealthMetric(
                    timestamp=timestamp,
                    account=account_name,
                    metric_type="alb",
                    name=tg_name,
                    value=float(healthy),
                    status=status,
                    details={
                        "total": len(targets),
                        "unhealthy": unhealthy
                    }
                )
                metrics.append(metric)
            
            return metrics, total_healthy, total_unhealthy, total_targets
            
        except Exception as e:
            print(f"Error checking ALB targets in {account_name}: {e}", file=sys.stderr)
            return metrics, 0, 0, 0
    
    def check_asg_health(self, account_id: str) -> Tuple[List[HealthMetric], int, int]:
        """Check Auto Scaling Group health"""
        metrics = []
        account_name = self.ACCOUNTS[account_id]["name"]
        region = self.ACCOUNTS[account_id]["region"]
        timestamp = datetime.utcnow().isoformat() + "Z"
        unhealthy_asgs = 0
        total_asgs = 0
        
        try:
            session = self.create_session(account_id)
            asg = session.client("autoscaling", region_name=region)
            
            response = asg.describe_auto_scaling_groups()
            
            for group in response.get("AutoScalingGroups", []):
                total_asgs += 1
                asg_name = group["AutoScalingGroupName"]
                desired = group["DesiredCapacity"]
                running = len(group["Instances"])
                
                # Count healthy instances
                healthy = sum(1 for inst in group["Instances"] 
                            if inst["HealthStatus"] == "Healthy")
                unhealthy = running - healthy
                
                status = HealthStatus.HEALTHY.value
                if unhealthy > 0 or running < desired:
                    status = HealthStatus.DEGRADED.value
                    unhealthy_asgs += 1
                
                metric = HealthMetric(
                    timestamp=timestamp,
                    account=account_name,
                    metric_type="asg",
                    name=asg_name,
                    value=float(healthy),
                    status=status,
                    details={
                        "desired": desired,
                        "running": running,
                        "unhealthy": unhealthy
                    }
                )
                metrics.append(metric)
            
            return metrics, unhealthy_asgs, total_asgs
            
        except Exception as e:
            print(f"Error checking ASG health in {account_name}: {e}", file=sys.stderr)
            return metrics, 0, 0
    
    def check_rds_health(self, account_id: str) -> Tuple[List[HealthMetric], int, int]:
        """Check RDS instance health"""
        metrics = []
        account_name = self.ACCOUNTS[account_id]["name"]
        region = self.ACCOUNTS[account_id]["region"]
        timestamp = datetime.utcnow().isoformat() + "Z"
        unhealthy_rds = 0
        total_rds = 0
        
        try:
            session = self.create_session(account_id)
            rds = session.client("rds", region_name=region)
            
            response = rds.describe_db_instances()
            
            for db in response.get("DBInstances", []):
                total_rds += 1
                db_id = db["DBInstanceIdentifier"]
                db_status = db["DBInstanceStatus"]
                engine = db["Engine"]
                
                status = HealthStatus.HEALTHY.value if db_status == "available" else HealthStatus.UNHEALTHY.value
                if status == HealthStatus.UNHEALTHY.value:
                    unhealthy_rds += 1
                
                metric = HealthMetric(
                    timestamp=timestamp,
                    account=account_name,
                    metric_type="rds",
                    name=db_id,
                    value=1.0 if db_status == "available" else 0.0,
                    status=status,
                    details={
                        "db_status": db_status,
                        "engine": engine
                    }
                )
                metrics.append(metric)
            
            return metrics, unhealthy_rds, total_rds
            
        except Exception as e:
            print(f"Error checking RDS health in {account_name}: {e}", file=sys.stderr)
            return metrics, 0, 0
    
    def check_ec2_health(self, account_id: str) -> Tuple[List[HealthMetric], int, int]:
        """Check EC2 instance health"""
        metrics = []
        account_name = self.ACCOUNTS[account_id]["name"]
        region = self.ACCOUNTS[account_id]["region"]
        timestamp = datetime.utcnow().isoformat() + "Z"
        unhealthy_instances = 0
        total_instances = 0
        
        try:
            session = self.create_session(account_id)
            ec2 = session.client("ec2", region_name=region)
            
            response = ec2.describe_instances(
                Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
            )
            
            for reservation in response.get("Reservations", []):
                for instance in reservation.get("Instances", []):
                    total_instances += 1
                    instance_id = instance["InstanceId"]
                    instance_type = instance["InstanceType"]
                    
                    inst_status = instance.get("InstanceStatus", {}).get("Status", "unknown")
                    sys_status = instance.get("SystemStatus", {}).get("Status", "unknown")
                    
                    status = HealthStatus.HEALTHY.value
                    if inst_status != "ok" or sys_status != "ok":
                        status = HealthStatus.DEGRADED.value
                        unhealthy_instances += 1
                    
                    metric = HealthMetric(
                        timestamp=timestamp,
                        account=account_name,
                        metric_type="ec2",
                        name=instance_id,
                        value=1.0 if status == HealthStatus.HEALTHY.value else 0.0,
                        status=status,
                        details={
                            "type": instance_type,
                            "instance_status": inst_status,
                            "system_status": sys_status
                        }
                    )
                    metrics.append(metric)
            
            return metrics, unhealthy_instances, total_instances
            
        except Exception as e:
            print(f"Error checking EC2 health in {account_name}: {e}", file=sys.stderr)
            return metrics, 0, 0
    
    def check_cloudwatch_alarms(self, account_id: str) -> Tuple[List[HealthMetric], int]:
        """Check CloudWatch alarms"""
        metrics = []
        account_name = self.ACCOUNTS[account_id]["name"]
        region = self.ACCOUNTS[account_id]["region"]
        timestamp = datetime.utcnow().isoformat() + "Z"
        active_alarms = 0
        
        try:
            session = self.create_session(account_id)
            cw = session.client("cloudwatch", region_name=region)
            
            response = cw.describe_alarms(StateValue="ALARM")
            
            for alarm in response.get("MetricAlarms", []):
                active_alarms += 1
                alarm_name = alarm["AlarmName"]
                state_reason = alarm.get("StateReason", "Unknown")
                
                metric = HealthMetric(
                    timestamp=timestamp,
                    account=account_name,
                    metric_type="cloudwatch_alarm",
                    name=alarm_name,
                    value=1.0,
                    status=HealthStatus.UNHEALTHY.value,
                    details={
                        "state_reason": state_reason
                    }
                )
                metrics.append(metric)
            
            return metrics, active_alarms
            
        except Exception as e:
            print(f"Error checking CloudWatch alarms in {account_name}: {e}", file=sys.stderr)
            return metrics, 0
    
    def scan_all_accounts(self) -> None:
        """Perform full health scan across all accounts"""
        print("=" * 70)
        print("Multi-Account Health Scan")
        print("=" * 70)
        print()
        
        for account_id in self.ACCOUNTS:
            account_name = self.ACCOUNTS[account_id]["name"]
            print(f"Scanning {account_name} ({account_id})...")
            
            # Collect metrics
            alb_metrics, alb_healthy, alb_unhealthy, alb_total = self.check_alb_targets(account_id)
            self.metrics.extend(alb_metrics)
            
            asg_metrics, asg_unhealthy, asg_total = self.check_asg_health(account_id)
            self.metrics.extend(asg_metrics)
            
            rds_metrics, rds_unhealthy, rds_total = self.check_rds_health(account_id)
            self.metrics.extend(rds_metrics)
            
            ec2_metrics, ec2_unhealthy, ec2_total = self.check_ec2_health(account_id)
            self.metrics.extend(ec2_metrics)
            
            cw_metrics, cw_alarms = self.check_cloudwatch_alarms(account_id)
            self.metrics.extend(cw_metrics)
            
            # Count health status
            healthy = sum(1 for m in self.metrics if m.account == account_name and m.status == "healthy")
            degraded = sum(1 for m in self.metrics if m.account == account_name and m.status == "degraded")
            unhealthy = sum(1 for m in self.metrics if m.account == account_name and m.status == "unhealthy")
            total = healthy + degraded + unhealthy
            
            # Determine overall account status
            if unhealthy > 0 or cw_alarms > 0:
                overall_status = HealthStatus.UNHEALTHY.value
            elif degraded > 0 or asg_unhealthy > 0 or rds_unhealthy > 0:
                overall_status = HealthStatus.DEGRADED.value
            else:
                overall_status = HealthStatus.HEALTHY.value
            
            issues = []
            if alb_unhealthy > 0:
                issues.append(f"ALB: {alb_unhealthy} unhealthy targets")
            if asg_unhealthy > 0:
                issues.append(f"ASG: {asg_unhealthy} degraded groups")
            if rds_unhealthy > 0:
                issues.append(f"RDS: {rds_unhealthy} unhealthy instances")
            if ec2_unhealthy > 0:
                issues.append(f"EC2: {ec2_unhealthy} degraded instances")
            if cw_alarms > 0:
                issues.append(f"CloudWatch: {cw_alarms} active alarms")
            
            self.account_health[account_id] = AccountHealth(
                account_id=account_id,
                account_name=account_name,
                status=overall_status,
                metrics_count=total,
                healthy_count=healthy,
                degraded_count=degraded,
                unhealthy_count=unhealthy,
                issues=issues
            )
    
    def print_summary(self) -> None:
        """Print health summary"""
        print()
        print("=" * 70)
        print("SUMMARY")
        print("=" * 70)
        print()
        
        for account_id, health in self.account_health.items():
            status_symbol = "✓" if health.status == "healthy" else "⚠" if health.status == "degraded" else "✗"
            print(f"{status_symbol} {health.account_name:12} | Status: {health.status:10} | "
                  f"Healthy: {health.healthy_count:3} | Degraded: {health.degraded_count:3} | "
                  f"Unhealthy: {health.unhealthy_count:3}")
            
            if health.issues:
                for issue in health.issues:
                    print(f"  → {issue}")
        
        print()
    
    def export_json(self, filename: str) -> None:
        """Export metrics as JSON"""
        data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "accounts": {
                account_id: asdict(health)
                for account_id, health in self.account_health.items()
            },
            "metrics": [asdict(m) for m in self.metrics]
        }
        
        with open(filename, "w") as f:
            json.dump(data, f, indent=2)
        
        print(f"✓ Metrics exported to {filename}")


def main():
    parser = argparse.ArgumentParser(
        description="Multi-Account Health Monitor for AHRQGOV, EHC, PSO"
    )
    parser.add_argument("--export-json", type=str, help="Export metrics to JSON file")
    parser.add_argument("--account", type=str, choices=list(MultiAccountHealthMonitor.ACCOUNTS.keys()),
                       help="Scan specific account only")
    
    args = parser.parse_args()
    
    monitor = MultiAccountHealthMonitor()
    monitor.scan_all_accounts()
    monitor.print_summary()
    
    if args.export_json:
        monitor.export_json(args.export_json)


if __name__ == "__main__":
    main()
