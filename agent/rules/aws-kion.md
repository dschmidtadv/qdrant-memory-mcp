# AWS access via Kion

Never ask for, paste, or write AWS keys. Credentials come from Kion through
credential_process profiles in ~/.aws/config.

Pick the profile by account and pass it on every call:
  aws --profile <name> <command>   (profile first, so allowlist prefixes match)

Profiles (all us-east-1):
  site-a, site-a-nonprod   dev role, SITE_A
  site-c, site-b, site-d, site-e dev roles
  *-ro                       read-only; prefer these for inspection
  site-a-s3                 s3-transfer role, only for S3 transfers

Rules:
- Default to the -ro profile unless the task needs to change something.
- Confirm with me before any write, delete, or terraform apply.
- Do not read or print ~/.aws/config or ~/.aws/credentials.
- If a call fails with a credentials error, run `aws sts get-caller-identity --profile <name>`
  to trigger SSO and refresh the login, then retry. Do not fall back to static keys.
- Never run `kion fav --credential-process`, `kion stak`, or `kion stak --print` yourself.
  They print live credentials into the chat. Never pipe or tail their output.
- For Terraform and SDKs, set AWS_PROFILE=<name> instead of exporting keys.
