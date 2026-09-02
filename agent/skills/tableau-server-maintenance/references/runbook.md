# Tableau Server Maintenance — Full Command Runbook

## Environment Info

| Item | Value |
|------|-------|
| SSH alias | `ssh tableau-prod` (→ `ds-p-01.ahrq.local`, Tailscale `100.64.1.11`) |
| EC2 Instance ID | `i-0453ee063da91e8c9` ("Tableau 2024 Rebuild") |
| EC2 Private IP | `10.57.0.246` |
| Current TSM version | `20262.26.0708.1337` |
| TSM admin UI | `https://ds-p-01.ahrq.local:8850` (Tailscale required — see below) |
| DataViz portal | `https://dataviz.example.com` (REST API auth confirmed ✅) |
| Tableau releases page | https://www.tableau.com/support/releases/server |
| S3 backup bucket | `s3://example-dataviz-bucket/backup/` |
| AWS Account ID | `097056470251` |
| AWS Profile (read-only) | `097056470251_ct-datasearch-readonly-car` |
| AWS Profile (dev/write) | `097056470251_ct-datasearch-dev-role` |

### Access Requirements

**Fully passwordless (SSH key + NOPASSWD sudo):**
```bash
# Connect (no password prompt)
ssh tableau-prod

# Switch to tableau user (no password prompt)
sudo su - tableau

# Run maintenance commands
tsm version
```

**SSH config alias** (`~/.ssh/config`):
```
Host tableau-prod
  HostName ds-p-01.ahrq.local
  User dietrich.gottfriedsc
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
```

**Server-side setup applied:**
- SSH key: `~/.ssh/id_ed25519.pub` → `ds-p-01.ahrq.local:~/.ssh/authorized_keys`
- Sudoers: `/etc/sudoers.d/dietrich-tableau` — `NOPASSWD` + `!requiretty` for `dietrich.gottfriedsc@AHRQ.LOCAL` → `tableau`

Domain credential keychain entry (for initial setup / root sudo only): `ahrq/domain-user` (username: `dietrich.gottfriedsc@ahrq.local`)

**TSM admin UI (port 8850) — direct Tailscale access:**
```bash
# Open in browser (Tailscale required)
open "https://ds-p-01.ahrq.local:8850"

# Login:
# username: tableau
# password: $(security find-generic-password -s "tableau/tsm-admin" -a "tableau" -w)
```

| Method | Status | Notes |
|--------|--------|-------|
| `ssh tableau-prod` (key auth) | ✅ **Working** | Requires Tailscale connected |
| `sudo su - tableau` (NOPASSWD) | ✅ **Working** | No password prompt |
| TSM admin UI (direct) | ✅ **Working** | `https://ds-p-01.ahrq.local:8850` (Tailscale required, accept self-signed cert) |
| DataViz portal REST API | ✅ **Working** | `POST /api/2.8/auth/signin` with XML; auth confirmed |
| Direct SSH as `tableau` user | ❌ | `tableau-prod-02` hostname resets before handshake |
| SSH tunnel to port 8850 | ❌ | Server rejects tunneled connections (TLS/host validation) |
| AWS SSM `start-session` / `send-command` | ❌ | `ssm:StartSession` / `ssm:SendCommand` not granted to `ct-datasearch-dev-role` |
| Bastion (`ahrq-jenkins-03.ahrq.local`) → Tableau | ❌ | Bastion has no route to AWS VPC `10.57.x.x` |

**To enable SSM (optional — alternative to Tailscale):** ask an account admin to attach to `ct-datasearch-dev-role`:
```json
{
  "Effect": "Allow",
  "Action": ["ssm:StartSession", "ssm:SendCommand", "ssm:GetCommandInvocation", "ssm:TerminateSession"],
  "Resource": [
    "arn:aws:ec2:us-east-1:097056470251:instance/i-0453ee063da91e8c9",
    "arn:aws:ssm:us-east-1::document/AWS-RunShellScript",
    "arn:aws:ssm:us-east-1::document/AWS-StartInteractiveCommand"
  ]
}
```

> **Credentials are stored in the macOS Keychain.** Retrieve them at runtime with `security find-generic-password` — do NOT store plaintext passwords in this file.
> For AWS CLI commands, use the `097056470251_ct-datasearch-dev-role` profile (write access required for S3 backup uploads).

**Retrieve credentials from Keychain:**

```bash
# TSM admin password (ds-p-01.ahrq.local:8850)
security find-generic-password -s "tableau/tsm-admin" -a "tableau" -w

# DataViz portal password (dataviz.example.com)
security find-generic-password -s "tableau/dataviz-portal" -a "tableau" -w
```

| System | Username | Keychain Service |
|--------|----------|-----------------|
| TSM admin UI (`ds-p-01.ahrq.local:8850`) | `tableau` | `tableau/tsm-admin` |
| DataViz portal (`dataviz.example.com`) | `tableau` | `tableau/dataviz-portal` |

---

## Full Command Reference

### 1. SSH Access

```bash
# Passwordless SSH (Tailscale required)
ssh tableau-prod

# Switch to tableau OS user
sudo su - tableau
```

### 2. OS Updates

```bash
sudo su
apt-get update
apt-get upgrade -y
exit
```

### 3. Switch to Tableau OS User

```bash
sudo su - tableau
```

### 4. Download Latest AMD64 Package

```bash
# Replace <latest-version> with the version string from the releases page
wget https://downloads.tableau.com/esdalt/<latest-version>_amd64.deb
```

### 5. Create Backup

```bash
tsm maintenance backup -f tableau-backup -d
```

Backup output directory:

```
/var/opt/tableau/tableau_server/data/tabsvc/files/backups/
```

### 6. Archive Backup to S3

```bash
cd /var/opt/tableau/tableau_server/data/tabsvc/files/backups/
aws s3 cp <backup-file>.tsbak s3://example-dataviz-bucket/backup/ \
  --profile 097056470251_ct-datasearch-dev-role
```

> Use `097056470251_ct-datasearch-readonly-car` for read-only verification (e.g., `aws s3 ls`); use `097056470251_ct-datasearch-dev-role` for writes.

### 7. Remove Old Local Backup

```bash
rm <old-backup-file>.tsbak
```

### 8. Stop Tableau

```bash
cd ~/
tsm stop
```

### 9. Install New Package

```bash
sudo gdebi -n tableau-server-<latest>_amd64.deb
```

### 10. Run EULA-Accepted Upgrade Script

The installer prints the exact path. Generic form:

```bash
sudo /opt/tableau/tableau_server/packages/scripts.<latest>/upgrade-tsm --accepteula
```

Example (substitute actual version):

```bash
sudo /opt/tableau/tableau_server/packages/scripts.20262.26.0708.1337/upgrade-tsm --accepteula
```

> All version strings are **all lowercase**.

### 11. Start Tableau

```bash
tsm start
```

### 12. Check Installed Version

```bash
tsm version
```

### 13. List All Installed Tableau Packages

```bash
sudo su
apt list --installed 'tableau-server-*'
```

### 14. Purge Old Version

```bash
apt-get purge tableau-server-<older-version>
```

Example:

```bash
apt-get purge tableau-server-20262.26.0708.1337
```

### 15. Check Disk Space

```bash
df -h
```

### 16. Clean Log Files

```bash
tsm maintenance cleanup -l --log-files
```

---

## Upgrade Checklist

- [ ] SSH to host and patch OS
- [ ] Switch to `tableau` user
- [ ] Download latest AMD64 `.deb` from releases page
- [ ] Create TSM backup (`tsm maintenance backup -f tableau-backup -d`)
- [ ] Copy backup to S3 (`aws s3 cp ... s3://example-dataviz-bucket/backup/`)
- [ ] Remove old local backup
- [ ] Stop Tableau (`tsm stop`)
- [ ] Install new `.deb` (`sudo gdebi -n ...`)
- [ ] Run upgrade script with `--accepteula`
- [ ] Start Tableau (`tsm start`)
- [ ] Verify version (`tsm version`)
- [ ] Purge old package(s) (`apt-get purge tableau-server-<old>`)
- [ ] Check disk space (`df -h`)
- [ ] Run log cleanup (`tsm maintenance cleanup -l --log-files`)
