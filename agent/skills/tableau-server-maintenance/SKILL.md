---
name: tableau-server-maintenance
description: This skill should be used when performing Tableau Server administration tasks including upgrading to a new version, creating and archiving backups to S3, purging old installed versions, and running maintenance cleanup on log files. Use when a user asks to upgrade Tableau, back up Tableau, purge old Tableau packages, or clean up Tableau logs on a Linux (Ubuntu/Debian) server.
---

# Tableau Server Maintenance

This skill covers the full Tableau Server maintenance lifecycle on a Linux (Ubuntu/Debian) host: OS patching, backup creation and S3 archival, version upgrade, old-version purge, and log cleanup.

## Prerequisites

- Tailscale connected to AHRQ network (ICMP is blocked — verify with `ssh tableau-prod "echo OK"`, not `ping`)
- SSH alias `tableau-prod` configured in `~/.ssh/config` (key-based, no password prompt)
  - Connects to `ds-p-01.ahrq.local` as `dietrich.gottfriedsc` using `~/.ssh/id_ed25519`
  - `sudo su - tableau` requires no password (sudoers rule in `/etc/sudoers.d/dietrich-tableau`)
- AWS CLI v2 is installed on the server; the **EC2 instance role** has S3 read/write access to `example-dataviz-bucket` — no `--profile` flag is needed when running `aws s3` commands on the server
- AWS CLI profile `097056470251_ct-datasearch-dev-role` on the local workstation (only needed if uploading from local instead of from the server)
- `gdebi` installed on the host
- **Current installed version:** `20262.26.0819.2015` (2026.2.2 — only version installed as of 2026-09-16)
- See [`references/runbook.md`](references/runbook.md) for full environment details, keychain credential retrieval, and access method comparison

## Disk Layout (Critical)

The server has a constrained disk layout. Know where to put large files:

| Mount | Size | Typical Use% | Purpose |
|---|---|---|---|
| `/home` | **4.9 GB** | 60-100% | Home dirs — **TOO SMALL for .deb downloads (~3 GB)** |
| `/` (root) | 12 GB | ~77% | OS, `/tmp`, `/opt` — also too small for .deb |
| `/var/opt/tableau` | 492 GB | 15-30% | Tableau data — **USE THIS for downloads** |

> ⚠️ **NEVER download `.deb` packages to `~/` or `/tmp`.** Always download to `/var/opt/tableau/`.

## Web Access

| Interface | URL | Notes |
|---|---|---|
| **Tableau Web UI** | `https://dataviz.example.com` | Production, AHRQ network required |
| **TSM Admin** | `https://ds-p-01.ahrq.local:8850` | Direct, Tailscale required |

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

Switch to the `tableau` OS user and download the target `.deb` package **to `/var/opt/tableau/`** (the only partition with enough space).

**Finding the download URL programmatically:**

```bash
# 1. Get the latest marketing version from the releases page
curl -sL "https://www.tableau.com/support/releases/server" | grep -oiE '2026\.2\.[0-9]+' | sort -V | uniq | tail -1
# Example output: 2026.2.2

# 2. Get the build number from the release detail page
curl -sL "https://www.tableau.com/support/releases/server/2026.2.2" | grep -oiE '[0-9]{5}\.[0-9]{2}\.[0-9]{4}\.[0-9]{4}'
# Example output: 20262.26.0819.2015

# 3. Construct the download URL (marketing version with dashes)
# Pattern: https://downloads.tableau.com/esdalt/{marketing-version}/tableau-server-{dashed-version}_amd64.deb
# Example: https://downloads.tableau.com/esdalt/2026.2.2/tableau-server-2026-2-2_amd64.deb

# 4. Verify the URL returns HTTP 200 before downloading
curl -sI "https://downloads.tableau.com/esdalt/2026.2.2/tableau-server-2026-2-2_amd64.deb" | head -1
```

> The Tableau releases page is a JavaScript SPA — download links are NOT in the raw HTML. Use the pattern above instead of trying to scrape links directly.

**Downloading:**

```bash
sudo su - tableau
cd /var/opt/tableau
wget https://downloads.tableau.com/esdalt/<marketing-version>/tableau-server-<dashed-version>_amd64.deb
```

> **Do NOT use `wget -O ~/file.deb`** — the `/home` partition is only 4.9 GB and will fill up, causing a truncated download.

### Phase 3 — Backup & Archive to S3

```bash
# Create backup (date-stamped)
tsm maintenance backup -f tableau-backup -d

# Navigate to backup directory
cd /var/opt/tableau/tableau_server/data/tabsvc/files/backups/

# Copy to S3 (EC2 instance role provides access — no --profile needed)
aws s3 cp <backup-file>.tsbak s3://example-dataviz-bucket/backup/

# Verify the upload succeeded
aws s3 ls s3://example-dataviz-bucket/backup/<backup-file>.tsbak

# Remove previous (not current) local backup to free disk
rm <old-backup-file>.tsbak
```

> Always verify the S3 copy succeeded before removing local files.
> Backup duration: 15-25 minutes typical for current data volume (~8 GB).

### Phase 4 — Stop, Upgrade, Start

```bash
# Stop Tableau
tsm stop

# Install new .deb package (use full path to /var/opt/tableau/)
sudo gdebi -n /var/opt/tableau/tableau-server-<dashed-version>_amd64.deb

# Accept EULA and run the upgrade script provided post-install
# The exact path is printed by gdebi — copy it verbatim. Pattern:
sudo /opt/tableau/tableau_server/packages/scripts.<build-number>/upgrade-tsm --accepteula

# Start Tableau
tsm start

# Verify
tsm version
tsm status
```

> The exact path to `upgrade-tsm` is printed by the installer — copy it verbatim.
> The upgrade script runs multiple jobs (credential generation, database migration, search index rebuild, metadata store reset). Expect 10-15 minutes.

### Phase 5 — Purge Old Versions

```bash
# Confirm active version
tsm version

# List all installed Tableau server packages
sudo apt list --installed 'tableau-server-*'

# Purge each old version (repeat for every stale package)
sudo apt-get purge -y tableau-server-<older-build-number>

# Clean up the downloaded .deb package
rm /var/opt/tableau/tableau-server-<dashed-version>_amd64.deb
```

> Purging the old version frees ~25 GB of disk space.

### Phase 6 — Disk & Log Cleanup

```bash
# Check remaining disk space
df -h

# Remove stale log files
tsm maintenance cleanup -l --log-files
```

---

## Version History

| Date | From | To | Notes |
|---|---|---|---|
| 2026-09-16 | 20262.26.0708.1337 (2026.2.1) | 20262.26.0819.2015 (2026.2.2) | Maintenance upgrade, 385 GB free post-cleanup |

## Reference

See [`references/runbook.md`](references/runbook.md) for the full command reference, environment URLs, and credential notes.
