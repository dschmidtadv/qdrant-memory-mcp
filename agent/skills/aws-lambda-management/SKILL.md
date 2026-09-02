---
name: aws-lambda-management
description: AWS Lambda function deployment, management, and monitoring for DevOps and cloud engineers.
---

# AWS Lambda Management Skill

**Status:** ACTIVE  
**Mode:** `devops-engineer`, `aws-engineer`  
**MCP Server:** `aws-lambda`  
**Last Updated:** 2026-05-22

---

## Overview

This skill provides a structured runbook for managing AWS Lambda functions using the AWS Lambda MCP server. It covers function deployment, code updates, layer management, alias configuration, and permission handling.

**Use this skill when:**
- Deploying new Lambda functions
- Updating function code or configuration
- Managing Lambda layers and dependencies
- Creating/updating function aliases
- Configuring function permissions and triggers
- Troubleshooting Lambda deployment issues

---

## Prerequisites

1. **AWS Credentials:** `AWS_PROFILE` and `AWS_REGION` environment variables configured
2. **IAM Permissions:** User/role must have `lambda:*` permissions (or scoped equivalents)
3. **MCP Server:** `aws-lambda` upstream active in `mcp-proxy`
4. **Tool Access:** Verify tools available via `mcp_search("lambda")`

---

## Core Workflows

### Workflow 1: List and Inspect Functions

**Goal:** Discover existing Lambda functions and inspect their configuration.

**Steps:**

1. **List all functions in the region:**
   ```
   mcp_call(ref="t:aws-lambda.list_functions", args={})
   ```
   Returns: Array of function metadata (name, ARN, runtime, handler, memory, timeout)

2. **Get detailed function configuration:**
   ```
   mcp_call(ref="t:aws-lambda.get_function", args={
     "function_name": "my-function"
   })
   ```
   Returns: Full function config, code location, environment variables, VPC settings, layers

3. **Get function code location:**
   ```
   mcp_call(ref="t:aws-lambda.get_function_code_location", args={
     "function_name": "my-function"
   })
   ```
   Returns: S3 bucket, key, and signed URL for downloading function code

**Decision Tree:**
- If function not found → Check function name spelling and region
- If function found → Proceed to Workflow 2 (update) or Workflow 3 (invoke)

---

### Workflow 2: Deploy or Update Function Code

**Goal:** Create a new Lambda function or update existing function code.

**Steps:**

1. **Create new function:**
   ```
   mcp_call(ref="t:aws-lambda.create_function", args={
     "function_name": "my-new-function",
     "runtime": "nodejs18.x",
     "role": "arn:aws:iam::ACCOUNT:role/lambda-execution-role",
     "handler": "index.handler",
     "code": {
       "ZipFile": "<base64-encoded-zip>"
     },
     "timeout": 30,
     "memory_size": 256,
     "environment": {
       "variables": {
         "LOG_LEVEL": "INFO"
       }
     }
   })
   ```
   Returns: Function ARN, version, state

2. **Update function code (existing function):**
   ```
   mcp_call(ref="t:aws-lambda.update_function_code", args={
     "function_name": "my-function",
     "zip_file": "<base64-encoded-zip>"
   })
   ```
   Returns: New code SHA256, version, state

3. **Update function configuration:**
   ```
   mcp_call(ref="t:aws-lambda.update_function_configuration", args={
     "function_name": "my-function",
     "timeout": 60,
     "memory_size": 512,
     "environment": {
       "variables": {
         "LOG_LEVEL": "DEBUG"
       }
     }
   })
   ```
   Returns: Updated config, last modified timestamp

**Decision Tree:**
- If creating new function → Verify IAM role exists and has trust policy for Lambda
- If updating code → Verify ZIP file is valid and contains handler
- If updating config → Verify timeout and memory are within Lambda limits (15 min timeout, 128-10240 MB memory)

---

### Workflow 3: Invoke Function

**Goal:** Test or trigger a Lambda function synchronously.

**Steps:**

1. **Invoke function synchronously:**
   ```
   mcp_call(ref="t:aws-lambda.invoke_function", args={
     "function_name": "my-function",
     "invocation_type": "RequestResponse",
     "payload": {
       "key": "value"
     }
   })
   ```
   Returns: Status code, response payload, function logs (if LogType=Tail)

2. **Invoke asynchronously (fire-and-forget):**
   ```
   mcp_call(ref="t:aws-lambda.invoke_function", args={
     "function_name": "my-function",
     "invocation_type": "Event",
     "payload": {
       "key": "value"
     }
   })
   ```
   Returns: Status code, request ID (no response payload)

**Decision Tree:**
- If testing function → Use `RequestResponse` to see output
- If triggering background job → Use `Event` for async invocation
- If invocation fails → Check CloudWatch logs via `aws-cloudwatch` MCP server

---

### Workflow 4: Manage Lambda Layers

**Goal:** Create and manage Lambda layers for shared dependencies.

**Steps:**

1. **List layers:**
   ```
   mcp_call(ref="t:aws-lambda.list_layers", args={})
   ```
   Returns: Layer names, ARNs, latest version

2. **Get layer version:**
   ```
   mcp_call(ref="t:aws-lambda.get_layer_version", args={
     "layer_name": "my-layer",
     "version_number": 1
   })
   ```
   Returns: Layer ARN, code size, compatible runtimes

3. **Publish new layer version:**
   ```
   mcp_call(ref="t:aws-lambda.publish_layer_version", args={
     "layer_name": "my-layer",
     "zip_file": "<base64-encoded-zip>",
     "compatible_runtimes": ["nodejs18.x", "nodejs20.x"]
   })
   ```
   Returns: Layer ARN, version number, code SHA256

4. **Delete layer version:**
   ```
   mcp_call(ref="t:aws-lambda.delete_layer_version", args={
     "layer_name": "my-layer",
     "version_number": 1
   })
   ```
   Returns: Success confirmation

**Decision Tree:**
- If creating shared dependencies → Use layers instead of bundling with function
- If updating layer → Publish new version, don't delete old versions (functions may reference them)
- If cleaning up → Delete only unused versions

---

### Workflow 5: Manage Function Aliases

**Goal:** Create and manage Lambda function aliases for versioning and traffic shifting.

**Steps:**

1. **List aliases:**
   ```
   mcp_call(ref="t:aws-lambda.list_aliases", args={
     "function_name": "my-function"
   })
   ```
   Returns: Alias names, function versions, routing configs

2. **Create alias:**
   ```
   mcp_call(ref="t:aws-lambda.create_alias", args={
     "function_name": "my-function",
     "name": "prod",
     "function_version": "5"
   })
   ```
   Returns: Alias ARN, function version

3. **Update alias (traffic shifting):**
   ```
   mcp_call(ref="t:aws-lambda.update_alias", args={
     "function_name": "my-function",
     "name": "prod",
     "function_version": "6",
     "routing_config": {
       "additional_version_weight": {
         "5": 0.1
       }
     }
   })
   ```
   Returns: Updated alias config with routing weights

4. **Delete alias:**
   ```
   mcp_call(ref="t:aws-lambda.delete_alias", args={
     "function_name": "my-function",
     "name": "prod"
   })
   ```
   Returns: Success confirmation

**Decision Tree:**
- If deploying new version → Create alias pointing to new version
- If canary deploying → Use routing_config to split traffic (90% old, 10% new)
- If rolling back → Update alias to point to previous version

---

### Workflow 6: Manage Function Permissions

**Goal:** Configure Lambda resource-based policies for triggers and cross-account access.

**Steps:**

1. **Get current policy:**
   ```
   mcp_call(ref="t:aws-lambda.get_policy", args={
     "function_name": "my-function"
   })
   ```
   Returns: Policy document (JSON)

2. **Add permission (e.g., allow API Gateway to invoke):**
   ```
   mcp_call(ref="t:aws-lambda.add_permission", args={
     "function_name": "my-function",
     "statement_id": "AllowAPIGateway",
     "action": "lambda:InvokeFunction",
     "principal": "apigateway.amazonaws.com",
     "source_arn": "arn:aws:execute-api:REGION:ACCOUNT:API_ID/*"
   })
   ```
   Returns: Updated policy

3. **Remove permission:**
   ```
   mcp_call(ref="t:aws-lambda.remove_permission", args={
     "function_name": "my-function",
     "statement_id": "AllowAPIGateway"
   })
   ```
   Returns: Success confirmation

**Decision Tree:**
- If setting up trigger → Add permission for the service (SNS, SQS, EventBridge, etc.)
- If cross-account access → Use principal as cross-account role ARN
- If removing trigger → Remove corresponding permission statement

---

## Troubleshooting

### Issue: Function not found
**Cause:** Wrong function name or region  
**Resolution:**
1. List functions: `mcp_call(ref="t:aws-lambda.list_functions", args={})`
2. Verify function name matches exactly
3. Check `AWS_REGION` environment variable

### Issue: Permission denied on create/update
**Cause:** IAM role lacks `lambda:CreateFunction` or `lambda:UpdateFunctionCode`  
**Resolution:**
1. Verify IAM role has `lambda:*` or scoped permissions
2. Check trust policy allows Lambda service
3. Use `aws-iam` MCP server to inspect role policies

### Issue: Invocation timeout
**Cause:** Function execution exceeds timeout setting  
**Resolution:**
1. Check function timeout: `mcp_call(ref="t:aws-lambda.get_function", args={"function_name": "..."})`
2. Increase timeout: `mcp_call(ref="t:aws-lambda.update_function_configuration", args={"function_name": "...", "timeout": 300})`
3. Check CloudWatch logs for slow operations

### Issue: Code update fails
**Cause:** ZIP file too large (>50 MB) or invalid format  
**Resolution:**
1. Verify ZIP contains handler file
2. If >50 MB, use S3 upload: `mcp_call(ref="t:aws-lambda.update_function_code", args={"function_name": "...", "s3_bucket": "...", "s3_key": "..."})`
3. Check ZIP integrity locally before uploading

---

## Integration with Other Skills

- **`aws-cloudwatch-observability`:** Use to view Lambda logs and metrics after invocation
- **`aws-iam-analysis`:** Use to inspect Lambda execution role policies
- **`aws-ecs-troubleshooting`:** Use for comparing Lambda vs ECS deployment patterns

---

## References

- [AWS Lambda API Reference](https://docs.aws.amazon.com/lambda/latest/dg/API_Reference.html)
- [Lambda Function Configuration](https://docs.aws.amazon.com/lambda/latest/dg/lambda-functions.html)
- [Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)
- [Lambda Aliases](https://docs.aws.amazon.com/lambda/latest/dg/configuration-aliases.html)
- [Lambda Resource-Based Policies](https://docs.aws.amazon.com/lambda/latest/dg/access-control-resource-based.html)
