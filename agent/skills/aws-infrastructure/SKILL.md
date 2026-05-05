---
name: aws-infrastructure
description: name: aws-infrastructuredescription: Portable AWS management for Terraform & CLI. Handles .env-based profiles and interactive re-authentication.triggers:awsterraformprovisionvalidateauditprofileauthAWS Infrastructure Skill (Portable)Environment InitializationBefore running any AWS or Terraform operations, perform this internal "Pre-Flight Check":Check .env: Look for AWS_PROFILE in the project's root .env file.Identity Verification: Run aws sts get-caller-identity --profile [PROFILE_FROM_ENV] (default to default if not found).Authentication Failure Handling: If the identity check fails (e.g., ExpiredToken, AccessDenied, or InvalidClientTokenId):Inform the user: "The AWS session for profile [PROFILE_NAME] has expired or is invalid."Interactive Update:Prompt the user for: AWS Access Key ID, AWS Secret Access Key, and AWS Session Token (if applicable).Update the credentials file using:aws configure set aws_access_key_id [VALUE] --profile [PROFILE_NAME]aws configure set aws_secret_access_key [VALUE] --profile [PRO
---

# Aws Infrastructure

## Instructions

Add your skill instructions here.
