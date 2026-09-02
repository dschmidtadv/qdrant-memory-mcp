#!/usr/bin/env bash
#
# check-brain-staleness.sh
#
# Compares each memory brain's last-indexed time against the repo's current
# git state and flags anything that's fallen behind. Exit code is nonzero if
# any brain is stale, so it can gate a session start or run as a hook.
#
# Usage:
#   scripts/check-brain-staleness.sh              # human-readable report
#   scripts/check-brain-staleness.sh --quiet       # exit code only, no output unless stale
#   scripts/check-brain-staleness.sh --fix         # also run the reindex commands for stale brains
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

QUIET=false
FIX=false
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=true ;;
    --fix) FIX=true ;;
  esac
done

STALE_COUNT=0

log() {
  $QUIET || echo "$@"
}

# Portable mtime-as-epoch (macOS/BSD stat vs GNU stat)
mtime_epoch() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null
}

# Portable "list files newer than a given reference file, tracked or not,
# excluding brain dirs/VCS". Uses -newer against a real file rather than
# -newermt/@epoch, since BSD find (macOS) rejects the @epoch form GNU find accepts.
files_changed_since() {
  local ref_file="$1"
  find . -type f \
    -not -path "./.git/*" \
    -not -path "./.gitnexus/*" \
    -not -path "./.codemap/*" \
    -not -path "./node_modules/*" \
    -newer "$ref_file" 2>/dev/null | wc -l | tr -d ' '
}

last_commit_epoch() {
  git log -1 --format=%ct 2>/dev/null || echo 0
}
last_commit_short() {
  git log -1 --format="%h %ad %s" --date=short 2>/dev/null || echo "(no commits)"
}

# ---------------------------------------------------------------------------
# GitNexus: staleness = any commits landed after .gitnexus/lbug's mtime
# ---------------------------------------------------------------------------
check_gitnexus() {
  local idx=".gitnexus/lbug"
  log ""
  log "== GitNexus (structural) =="
  if [ ! -f "$idx" ]; then
    log "  MISSING - never indexed. Run: gitnexus analyze --drop-embeddings"
    STALE_COUNT=$((STALE_COUNT+1))
    $FIX && { log "  -> running gitnexus analyze --drop-embeddings"; gitnexus analyze --drop-embeddings; }
    return
  fi
  local idx_epoch commit_count
  idx_epoch=$(mtime_epoch "$idx")
  commit_count=$(git log --since="@${idx_epoch}" --oneline 2>/dev/null | wc -l | tr -d ' ')
  log "  indexed: $(date -r "$idx_epoch" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "epoch $idx_epoch")"
  log "  latest commit: $(last_commit_short)"
  if [ "$commit_count" -gt 0 ]; then
    log "  STALE - $commit_count commit(s) landed since last index"
    STALE_COUNT=$((STALE_COUNT+1))
    if $FIX; then
      log "  -> running gitnexus analyze --drop-embeddings"
      gitnexus analyze --drop-embeddings
    fi
  else
    log "  OK - up to date with HEAD"
  fi
}

# ---------------------------------------------------------------------------
# Codemap: staleness = any tracked/untracked files changed after graph.json's mtime
# ---------------------------------------------------------------------------
check_codemap() {
  local idx=".codemap/graph.json"
  log ""
  log "== Codemap (schema/YAML) =="
  if [ ! -f "$idx" ]; then
    log "  MISSING - never indexed. Run codemap_scan or codemap_reindex via MCP."
    STALE_COUNT=$((STALE_COUNT+1))
    return
  fi
  local idx_epoch changed
  idx_epoch=$(mtime_epoch "$idx")
  changed=$(files_changed_since "$idx")
  log "  indexed: $(date -r "$idx_epoch" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "epoch $idx_epoch")"
  if [ "${changed:-0}" -gt 0 ]; then
    log "  STALE - $changed file(s) changed since last index"
    STALE_COUNT=$((STALE_COUNT+1))
    log "  -> reindex via MCP: codemap_reindex or codemap_scan (no CLI equivalent; ask the agent)"
  else
    log "  OK - up to date"
  fi
}

# ---------------------------------------------------------------------------
# Qdrant: staleness = no memorize_context write for this project since last commit
# Requires curl + a local Qdrant on QDRANT_URL (default localhost:6333).
# ---------------------------------------------------------------------------
check_qdrant() {
  local qdrant_url="${QDRANT_URL:-http://localhost:6333}"
  local project_name
  project_name="$(basename "$REPO_ROOT")"
  log ""
  log "== Qdrant (semantic) =="

  if ! curl -s -o /dev/null -w '' --max-time 2 "$qdrant_url/collections/agent-memory" 2>/dev/null; then
    log "  UNREACHABLE - Qdrant not running at $qdrant_url (skipping; not counted as stale)"
    return
  fi

  local resp newest_ms commit_epoch
  resp=$(curl -s -X POST "$qdrant_url/collections/agent-memory/points/scroll" \
    -H 'Content-Type: application/json' \
    -d "{\"limit\": 500, \"filter\": {\"must\": [{\"key\": \"project\", \"match\": {\"value\": \"${project_name}\"}}]}, \"with_payload\": true, \"with_vector\": false}" \
    2>/dev/null)

  newest_ms=$(echo "$resp" | python3 -c "
import json,sys
try:
    pts=json.load(sys.stdin)['result']['points']
except Exception:
    print(0); exit()
best=0
for p in pts:
    ts=p.get('payload',{}).get('timestamp')
    if not ts: continue
    ms = ts if ts > 4102444800 else ts*1000  # normalize seconds->ms
    best=max(best, ms)
print(int(best))
" 2>/dev/null || echo 0)

  commit_epoch=$(last_commit_epoch)

  if [ "$newest_ms" = "0" ]; then
    log "  MISSING - no memory points found for project '$project_name'"
    STALE_COUNT=$((STALE_COUNT+1))
    return
  fi

  local newest_epoch=$((newest_ms / 1000))
  log "  newest memory: $(date -r "$newest_epoch" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "epoch $newest_epoch")"
  log "  latest commit: $(last_commit_short)"
  if [ "$commit_epoch" -gt "$newest_epoch" ]; then
    log "  STALE - latest commit postdates the newest memory entry (no memorize_context since)"
    STALE_COUNT=$((STALE_COUNT+1))
    log "  -> no bulk reindex; call memorize_context with a session summary to catch it up"
  else
    log "  OK - memory is current with or ahead of HEAD"
  fi
}

log "Brain staleness check for: $REPO_ROOT"
log "Project: $(basename "$REPO_ROOT")"

check_gitnexus
check_codemap
check_qdrant

log ""
if [ "$STALE_COUNT" -gt 0 ]; then
  log "== RESULT: $STALE_COUNT brain(s) stale =="
  exit 1
else
  log "== RESULT: all brains current =="
  exit 0
fi
