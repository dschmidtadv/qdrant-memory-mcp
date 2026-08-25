---
name: tableau-server-maintenance
description: This skill should be used when performing Tableau Server administration tasks including upgrading to a new version, creating and archiving backups to S3, purging old installed versions, and running maintenance cleanup on log files. Use when a user asks to upgrade Tableau, back up Tableau, purge old Tableau packages, or clean up Tableau logs on a Linux (Ubuntu/Debian) server.
---

# Tableau Server Maintenance

This skill covers the full Tableau Server maintenance lifecycle on a Linux (Ubuntu/Debian) host: OS patching, backup creation and S3 archival, version upgrade, old-version purge, and log cleanup.

## Prerequisites

- Tailscale connected to AHRQ network
- SSH alias `tableau-prod` configured in `~/.ssh/config` (key-based, no password prompt)
  - Connects to `ds-p-01.ahrq.local` as `dietrich.gottfriedsc` using `~/.ssh/id_ed25519`
  - `sudo su - tableau` requires no password (sudoers rule in `/etc/sudoers.d/dietrich-tableau`)
- AWS CLI profile `097056470251_ct-datasearch-dev-role` active and valid (for S3 backup uploads)
- `gdebi` installed on the host
- The `.deb` package URL from https://www.tableau.com/support/releases/server
- **Current installed version:** `20262.26.0708.1337` (only version installed — no old versions to purge as of 2026-08-25)
- See [`references/runbook.md`](references/runbook.md) for full environment details, keychain credential retrieval, and access method comparison

---

## Workflow

Follow these phases in order. Do not skip phases; each phase guards the next.

### Phase 1 — Connect & Patch OS

```bash
# Connect using SSH alias (passwordless, Tailscale required)
ssh tableau-prod

# Patch OS as root
sudo su
apt-get update && apt-get upgrade -y
exit

# Switch to tableau OS user for all TSM operations (passwordless)
sudo su - tableau
```

### Phase 2 — Download Latest Tableau Package

Switch to the `tableau` OS user and download the target `.deb` package.

```bash
sudo su - tableau
wget https://downloads.tableau.com/esdalt/<latest-version>_amd64.deb
```

> Obtain the exact URL from https://www.tableau.com/support/releases/server — right-click the AMD64 link and copy the address.

### Phase 3 — Backup & Archive to S3

```bash
# Create backup (date-stamped)
tsm maintenance backup -f tableau-backup -d

# Navigate to backup directory
cd /var/opt/tableau/tableau_server/data/tabsvc/files/backups/

# Copy to S3 (requires dev-role profile for write access)
aws s3 cp <backup-file>.tsbak s3://example-dataviz-bucket/backup/ \
  --profile 097056470251_ct-datasearch-dev-role

# Remove previous (not current) local backup to free disk
rm <old-backup-file>.tsbak
```

> Always verify the S3 copy succeeded before removing local files.

### Phase 4 — Stop, Upgrade, Start

```bash
# Return to home directory
cd ~/

# Stop Tableau
tsm stop

# Install new .deb package
sudo gdebi -n tableau-server-<latest>_amd64.deb

# Accept EULA and run the upgrade script provided post-install
sudo /opt/tableau/tableau_server/packages/scripts.<latest>/upgrade-tsm --accepteula

# Start Tableau
tsm start
```

> The exact path to `upgrade-tsm` is printed by the installer — copy it verbatim.

### Phase 5 — Purge Old Versions

```bash
# Confirm active version
tsm version

# List all installed Tableau server packages
sudo su
apt list --installed 'tableau-server-*'

# Purge each old version (repeat for every stale package)
apt-get purge tableau-server-<older-version>
```

### Phase 6 — Disk & Log Cleanup

```bash
# Check remaining disk space
df -h

# Remove stale log files
tsm maintenance cleanup -l --log-files
```

---

## Reference

See [`references/runbook.md`](references/runbook.md) for the full command reference, environment URLs, and credential notes.
