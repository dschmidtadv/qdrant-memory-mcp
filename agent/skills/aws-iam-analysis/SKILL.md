---
name: aws-iam-analysis
description: IAM security review, access analysis, and compliance assessment for AWS accounts.
---

# AWS IAM Analysis Skill

**Status:** ACTIVE  
**Mode:** `security-review`, `cloud-architect`, `compliance-reviewer`  
**MCP Server:** `aws-iam`  
**Last Updated:** 2026-05-22

---

## Overview

This skill provides a structured runbook for analyzing AWS IAM policies, roles, and permissions using the AWS IAM MCP server. It covers policy inspection, permission simulation, access key auditing, and security posture assessment.

**Use this skill when:**
- Auditing IAM policies for security compliance
- Analyzing role permissions and trust relationships
- Simulating policy effects before deployment
- Investigating access key usage and rotation
- Assessing MFA device configuration
- Reviewing cross-account access patterns

---

## Prerequisites

1. **AWS Credentials:** `AWS_PROFILE` and `AWS_REGION` environment variables configured
2. **IAM Permissions:** User/role must have `iam:Get*` and `iam:List*` permissions (read-only)
3. **MCP Server:** `aws-iam` upstream active in `mcp-proxy`
4. **Tool Access:** Verify tools available via `mcp_search("iam")`

---

## Core Workflows

### Workflow 1: Inventory IAM Resources

**Goal:** Discover and catalog all IAM users, groups, and roles in the account.

**Steps:**

1. **List all IAM users:**
   ```
   mcp_call(ref="t:aws-iam.list_users", args={})
   ```
   Returns: User names, ARNs, creation dates, password last used

2. **List all IAM groups:**
   ```
   mcp_call(ref="t:aws-iam.list_groups", args={})
   ```
   Returns: Group names, ARNs, creation dates

3. **List all IAM roles:**
   ```
   mcp_call(ref="t:aws-iam.list_roles", args={})
   ```
   Returns: Role names, ARNs, creation dates, assume role policy

**Decision Tree:**
- If auditing user access → Proceed to Workflow 2 (inspect user policies)
- If auditing service roles → Proceed to Workflow 3 (inspect role trust policies)
- If auditing group membership → Proceed to Workflow 4 (inspect group policies)

---

### Workflow 2: Inspect User Permissions

**Goal:** Analyze what permissions a specific IAM user has.

**Steps:**

1. **Get user details:**
   ```
   mcp_call(ref="t:aws-iam.get_user", args={
     "user_name": "alice"
   })
   ```
   Returns: User ARN, creation date, password last used, MFA devices

2. **List inline policies attached to user:**
   ```
   mcp_call(ref="t:aws-iam.list_user_policies", args={
     "user_name": "alice"
   })
   ```
   Returns: Policy names (inline policies only)

3. **Get inline policy document:**
   ```
   mcp_call(ref="t:aws-iam.get_user_policy", args={
     "user_name": "alice",
     "policy_name": "inline-policy-name"
   })
   ```
   Returns: Policy document (JSON)

4. **List managed policies attached to user:**
   ```
   mcp_call(ref="t:aws-iam.list_attached_user_policies", args={
     "user_name": "alice"
   })
   ```
   Returns: Managed policy names and ARNs

5. **Get managed policy details:**
   ```
   mcp_call(ref="t:aws-iam.get_policy", args={
     "policy_arn": "arn:aws:iam::ACCOUNT:policy/my-policy"
   })
   ```
   Returns: Policy metadata (creation date, update date, attachment count)

6. **Get policy version (actual permissions):**
   ```
   mcp_call(ref="t:aws-iam.get_policy_version", args={
     "policy_arn": "arn:aws:iam::ACCOUNT:policy/my-policy",
     "version_id": "v2"
   })
   ```
   Returns: Policy document (JSON) with statements

**Decision Tree:**
- If user has excessive permissions → Flag for remediation
- If user lacks required permissions → Recommend policy attachment
- If user has old policies → Check for deprecation and cleanup

---

### Workflow 3: Inspect Role Trust Relationships

**Goal:** Analyze which principals can assume a specific IAM role.

**Steps:**

1. **Get role details:**
   ```
   mcp_call(ref="t:aws-iam.get_role", args={
     "role_name": "lambda-execution-role"
   })
   ```
   Returns: Role ARN, creation date, max session duration

2. **Get role trust policy (assume role policy):**
   ```
   mcp_call(ref="t:aws-iam.get_role_trust_policy", args={
     "role_name": "lambda-execution-role"
   })
   ```
   Returns: Trust policy document (JSON) showing who can assume the role

3. **List inline policies attached to role:**
   ```
   mcp_call(ref="t:aws-iam.list_role_policies", args={
     "role_name": "lambda-execution-role"
   })
   ```
   Returns: Inline policy names

4. **Get inline policy document:**
   ```
   mcp_call(ref="t:aws-iam.get_role_policy", args={
     "role_name": "lambda-execution-role",
     "policy_name": "inline-policy-name"
   })
   ```
   Returns: Policy document (JSON)

5. **List managed policies attached to role:**
   ```
   mcp_call(ref="t:aws-iam.list_attached_role_policies", args={
     "role_name": "lambda-execution-role"
   })
   ```
   Returns: Managed policy names and ARNs

**Decision Tree:**
- If trust policy allows broad principals (e.g., `"Principal": "*"`) → Flag as security risk
- If trust policy is overly restrictive → May block legitimate service usage
- If role has excessive permissions → Recommend least-privilege policy

---

### Workflow 4: Inspect Group Permissions

**Goal:** Analyze what permissions a specific IAM group has.

**Steps:**

1. **Get group details:**
   ```
   mcp_call(ref="t:aws-iam.get_group", args={
     "group_name": "developers"
   })
   ```
   Returns: Group ARN, creation date, member count

2. **List inline policies attached to group:**
   ```
   mcp_call(ref="t:aws-iam.list_group_policies", args={
     "group_name": "developers"
   })
   ```
   Returns: Inline policy names

3. **Get inline policy document:**
   ```
   mcp_call(ref="t:aws-iam.get_group_policy", args={
     "group_name": "developers",
     "policy_name": "inline-policy-name"
   })
   ```
   Returns: Policy document (JSON)

4. **List managed policies attached to group:**
   ```
   mcp_call(ref="t:aws-iam.list_attached_group_policies", args={
     "group_name": "developers"
   })
   ```
   Returns: Managed policy names and ARNs

**Decision Tree:**
- If group has excessive permissions → Recommend least-privilege policy
- If group is empty → Consider removing unused group
- If group members need different permissions → Split into multiple groups

---

### Workflow 5: Simulate Policy Effects

**Goal:** Test what actions a principal can perform without making actual API calls.

**Steps:**

1. **Simulate principal policy (user/role with attached policies):**
   ```
   mcp_call(ref="t:aws-iam.simulate_principal_policy", args={
     "policy_source_arn": "arn:aws:iam::ACCOUNT:user/alice",
     "action_names": ["s3:GetObject", "s3:PutObject", "ec2:DescribeInstances"],
     "resource_arns": ["arn:aws:s3:::my-bucket/*", "arn:aws:ec2:*:ACCOUNT:instance/*"]
   })
   ```
   Returns: Evaluation results (allowed/denied) for each action

2. **Simulate custom policy (test policy before attaching):**
   ```
   mcp_call(ref="t:aws-iam.simulate_custom_policy", args={
     "policy_input_list": [
       {
         "Version": "2012-10-17",
         "Statement": [
           {
             "Effect": "Allow",
             "Action": "s3:*",
             "Resource": "*"
           }
         ]
       }
     ],
     "action_names": ["s3:GetObject", "s3:DeleteBucket"],
     "resource_arns": ["arn:aws:s3:::my-bucket/*"]
   })
   ```
   Returns: Evaluation results for each action

**Decision Tree:**
- If action is denied → Check policy for explicit deny or missing allow
- If action is allowed → Verify it's intentional (least-privilege check)
- If simulating new policy → Test before attaching to production roles

---

### Workflow 6: Audit Access Keys

**Goal:** Inventory and audit IAM access keys for rotation and usage.

**Steps:**

1. **List access keys for a user:**
   ```
   mcp_call(ref="t:aws-iam.list_access_keys", args={
     "user_name": "alice"
   })
   ```
   Returns: Access key IDs, creation dates, status (active/inactive)

2. **Get access key last used:**
   ```
   mcp_call(ref="t:aws-iam.get_access_key_last_used", args={
     "access_key_id": "AKIAIOSFODNN7EXAMPLE"
   })
   ```
   Returns: Last used timestamp, service name, region

**Decision Tree:**
- If access key not used in 90 days → Recommend deactivation/deletion
- If access key is old (>1 year) → Recommend rotation
- If access key is inactive → Safe to delete

---

### Workflow 7: Audit MFA Configuration

**Goal:** Verify MFA device configuration for users and roles.

**Steps:**

1. **List MFA devices for a user:**
   ```
   mcp_call(ref="t:aws-iam.list_mfa_devices", args={
     "user_name": "alice"
   })
   ```
   Returns: MFA device serial numbers, enable dates

2. **List all virtual MFA devices in account:**
   ```
   mcp_call(ref="t:aws-iam.list_virtual_mfa_devices", args={})
   ```
   Returns: Virtual MFA device serial numbers, user associations

**Decision Tree:**
- If user lacks MFA → Flag for compliance violation
- If MFA device is orphaned (no user) → Recommend deletion
- If MFA device is old → Verify it's still in use

---

## Security Analysis Patterns

### Pattern 1: Overly Permissive Policies

**Indicators:**
- Policies with `"Action": "*"` and `"Resource": "*"`
- Policies with `"Effect": "Allow"` and no conditions
- Roles with `AdministratorAccess` attached

**Remediation:**
1. Use `simulate_principal_policy` to identify actual required actions
2. Create least-privilege policy with specific actions and resources
3. Add conditions (IP restrictions, time-based, MFA requirement)

### Pattern 2: Unused Access Keys

**Indicators:**
- Access keys not used in 90+ days
- Access keys created but never used
- Multiple active access keys per user

**Remediation:**
1. Use `get_access_key_last_used` to identify unused keys
2. Deactivate unused keys (don't delete immediately)
3. Delete after 30-day grace period

### Pattern 3: Missing MFA

**Indicators:**
- Users without MFA devices
- Console access without MFA requirement
- Privileged roles without MFA

**Remediation:**
1. Use `list_mfa_devices` to audit MFA coverage
2. Enforce MFA via policy condition: `"Condition": {"Bool": {"aws:MultiFactorAuthPresent": "true"}}`
3. Require MFA for sensitive operations (IAM changes, billing)

### Pattern 4: Overly Broad Trust Policies

**Indicators:**
- Trust policy with `"Principal": "*"`
- Trust policy allowing cross-account access without conditions
- Service roles with unnecessary principals

**Remediation:**
1. Use `get_role_trust_policy` to audit trust relationships
2. Restrict principal to specific AWS account or service
3. Add conditions (source IP, external ID for cross-account)

---

## Troubleshooting

### Issue: Access denied on IAM operations
**Cause:** User/role lacks `iam:Get*` or `iam:List*` permissions  
**Resolution:**
1. Verify IAM role has read-only IAM permissions
2. Check if policy explicitly denies IAM actions
3. Use `simulate_principal_policy` to test permissions

### Issue: Policy simulation returns unexpected results
**Cause:** Policy conditions not evaluated correctly  
**Resolution:**
1. Verify policy syntax is valid JSON
2. Check for explicit deny statements (deny overrides allow)
3. Test with simplified policy first

### Issue: Access key last used shows no data
**Cause:** Access key never used or data not yet available  
**Resolution:**
1. Wait 24 hours for CloudTrail data to populate
2. Verify access key is active (not inactive)
3. Check if access key was used in a different region

---

## Integration with Other Skills

- **`aws-cloudwatch-observability`:** Use to view CloudTrail logs for IAM API calls
- **`aws-lambda-management`:** Use to inspect Lambda execution role policies
- **`aws-ecs-troubleshooting`:** Use to inspect ECS task role policies

---

## Compliance Mappings

| Compliance Framework | Relevant Checks |
|---------------------|-----------------|
| **CIS AWS Foundations** | MFA enabled, access key rotation, root account protection |
| **PCI DSS** | Least-privilege access, MFA for privileged users, access key rotation |
| **HIPAA** | Audit logging, access controls, encryption key management |
| **SOC 2** | Access reviews, privilege management, audit trails |

---

## References

- [AWS IAM API Reference](https://docs.aws.amazon.com/IAM/latest/APIReference/)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [IAM Policy Simulator](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html)
- [Access Key Rotation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys_rotate.html)
- [MFA Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html)
