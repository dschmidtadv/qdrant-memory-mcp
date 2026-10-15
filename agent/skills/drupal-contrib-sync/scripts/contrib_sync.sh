#!/usr/bin/env bash
# Sync a module developed in a site's modules/custom folder to its
# drupal.org git clone. See SKILL.md for the full workflow.
#
# Usage: contrib_sync.sh <command> <module> [args]
#   preflight  Check the drupal.org clone, pull, and detect upstream drift
#   preview    Show what a sync would change (dry run)
#   apply      Copy custom -> clone and stage everything
#   leakcheck  Scan staged additions for secrets and site-specific strings
#   pullback   Copy upstream changes clone -> custom (dry run unless --apply)
#   record     Remember the clone's HEAD as the last synced commit
#
# Env overrides:
#   DRUPAL_CONTRIB_ROOT  default ~/apps/drupal-contrib
#   SITE_MODULE_PATH     explicit path to the custom module folder

set -euo pipefail

CMD="${1:-}"
MODULE="${2:-}"
[[ -n "$CMD" && -n "$MODULE" ]] || { sed -n '2,17p' "$0"; exit 64; }
shift 2

CONTRIB_ROOT="${DRUPAL_CONTRIB_ROOT:-$HOME/apps/drupal-contrib}"
STATE_DIR="$CONTRIB_ROOT/.sync-state"
DEST="$CONTRIB_ROOT/$MODULE"
mkdir -p "$STATE_DIR"

die() { echo "ERROR: $*" >&2; exit 1; }

find_src() {
  if [[ -n "${SITE_MODULE_PATH:-}" ]]; then
    [[ -d "$SITE_MODULE_PATH" ]] || die "SITE_MODULE_PATH not found: $SITE_MODULE_PATH"
    echo "${SITE_MODULE_PATH%/}"; return
  fi
  local root
  root=$(git rev-parse --show-toplevel 2>/dev/null) || die "Run from inside the site repo or set SITE_MODULE_PATH"
  for d in web/modules/custom docroot/modules/custom modules/custom; do
    if [[ -d "$root/$d/$MODULE" ]]; then echo "$root/$d/$MODULE"; return; fi
  done
  die "No modules/custom/$MODULE found under $root"
}

# Files that exist only in the drupal.org repo, or never belong there.
EXCLUDES=(--exclude=.git --exclude=.gitlab-ci.yml --exclude=.gitlab/ \
          --exclude=.DS_Store --exclude=node_modules/ --exclude=.idea/ --exclude=.vscode/)
if [[ -f "$STATE_DIR/$MODULE.exclude" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    EXCLUDES+=("--exclude=$line")
  done < "$STATE_DIR/$MODULE.exclude"
fi

# -r recurse, -l keep symlinks, -c compare by checksum (ignores mtime noise), -i itemize
RSYNC=(rsync -rlci --delete "${EXCLUDES[@]}")

require_clone() {
  if [[ ! -d "$DEST/.git" ]]; then
    echo "NO_CLONE: $DEST does not exist."
    echo "Clone with: git clone git@git.drupal.org:project/$MODULE.git \"$DEST\""
    exit 2
  fi
}

cmd_preflight() {
  local src; src=$(find_src)
  require_clone
  echo "Source: $src"
  echo "Clone:  $DEST"
  echo "Branch: $(git -C "$DEST" rev-parse --abbrev-ref HEAD)"

  if [[ -n "$(git -C "$DEST" status --porcelain)" ]]; then
    echo "DIRTY_CLONE: uncommitted changes in $DEST"
    git -C "$DEST" status --short
    exit 1
  fi

  git -C "$DEST" fetch --quiet origin
  if git -C "$DEST" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    git -C "$DEST" pull --ff-only --quiet || die "Fast-forward pull failed; clone has diverged from origin"
  else
    echo "WARN: branch has no upstream tracking branch"
  fi

  local head last
  head=$(git -C "$DEST" rev-parse HEAD 2>/dev/null || echo "")
  last=$(cat "$STATE_DIR/$MODULE.last" 2>/dev/null || echo "")

  if [[ -z "$last" ]]; then
    echo "NO_SYNC_RECORD: first sync for this module (or state was lost)."
  elif [[ "$last" == "$head" ]]; then
    echo "UPSTREAM_CLEAN: no commits on drupal.org since the last sync."
  elif ! git -C "$DEST" cat-file -e "$last^{commit}" 2>/dev/null; then
    echo "WARN: recorded sync commit $last not found in clone (history rewritten?)"
  else
    echo "UPSTREAM_CHANGES: commits on drupal.org since last sync:"
    git -C "$DEST" log --format='  %h %an: %s' "$last..HEAD"
    echo "Files touched upstream:"
    local f conflict=0
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if [[ -e "$DEST/$f" && -e "$src/$f" ]] && ! cmp -s "$DEST/$f" "$src/$f"; then
        echo "  WOULD_OVERWRITE $f"; conflict=1
      elif [[ -e "$DEST/$f" && ! -e "$src/$f" ]]; then
        echo "  WOULD_DELETE    $f"; conflict=1
      else
        echo "  in-sync         $f"
      fi
    done < <(git -C "$DEST" diff --name-only "$last" HEAD)
    [[ $conflict -eq 1 ]] && echo "ACTION: run pullback before syncing, or confirm the overwrite is intended."
  fi

  local site_root rel
  site_root=$(git -C "$src" rev-parse --show-toplevel 2>/dev/null || echo "")
  if [[ -n "$site_root" ]]; then
    rel="${src#$site_root/}"
    if [[ -n "$(git -C "$site_root" status --porcelain -- "$rel")" ]]; then
      echo "NOTE: module has uncommitted changes in the site repo (they will still sync):"
      git -C "$site_root" status --short -- "$rel"
    fi
  fi
  echo "PREFLIGHT_OK"
}

cmd_preview() {
  local src; src=$(find_src); require_clone
  local out; out=$("${RSYNC[@]}" -n "$src/" "$DEST/")
  if [[ -z "$out" ]]; then echo "NO_CHANGES"; else echo "$out"; fi
}

cmd_apply() {
  local src; src=$(find_src); require_clone
  "${RSYNC[@]}" "$src/" "$DEST/" >/dev/null
  git -C "$DEST" add -A
  if git -C "$DEST" diff --cached --quiet; then
    echo "NO_CHANGES"
  else
    git -C "$DEST" diff --cached --stat
  fi
}

cmd_leakcheck() {
  require_clone
  local patterns='riva|rivasolutions|ahrq|\.gov([^a-z]|$)|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|(api[_-]?key|secret|password|passwd|token)[[:space:]]*[:=]|amazonaws\.com|\.internal([^a-z]|$)|192\.168\.|10\.[0-9]+\.[0-9]+\.[0-9]+|@[a-z0-9.-]+\.(com|org|net)|[A-Z][A-Z0-9]+-[0-9]+|TODO|FIXME|var_dump|dpm\(|kint\(|print_r\('
  if [[ -f "$STATE_DIR/$MODULE.leak-patterns" ]]; then
    local extra; extra=$(grep -v '^#' "$STATE_DIR/$MODULE.leak-patterns" | grep -v '^$' | paste -sd'|' -)
    [[ -n "$extra" ]] && patterns="$patterns|$extra"
  fi
  local hits
  hits=$(git -C "$DEST" diff --cached -U0 | PAT="$patterns" awk '
    BEGIN { pat = ENVIRON["PAT"] }
    /^\+\+\+ b\// { file = substr($0, 7); next }
    /^@@/ { split($3, a, ","); line = substr(a[1], 2) + 0; next }
    /^\+/ { if ($0 ~ pat || tolower($0) ~ pat) printf "%s:%d: %s\n", file, line, substr($0, 2); line++ }
  ')
  if [[ -z "$hits" ]]; then echo "LEAKCHECK_CLEAN"; else echo "LEAKCHECK_HITS (review each; many are false positives):"; echo "$hits"; fi
}

cmd_pullback() {
  local src; src=$(find_src); require_clone
  local apply=0 files=()
  for a in "$@"; do
    if [[ "$a" == "--apply" ]]; then apply=1; else files+=("$a"); fi
  done
  if [[ ${#files[@]} -gt 0 ]]; then
    for f in "${files[@]}"; do
      [[ -e "$DEST/$f" ]] || die "Not in clone: $f"
      if [[ $apply -eq 1 ]]; then
        mkdir -p "$(dirname "$src/$f")"; cp -p "$DEST/$f" "$src/$f"; echo "pulled $f"
      else
        echo "would pull $f"; diff -u "$src/$f" "$DEST/$f" || true
      fi
    done
  else
    # Whole-module pullback never deletes files in the site copy.
    local flags=(rsync -rlci "${EXCLUDES[@]}")
    [[ $apply -eq 0 ]] && flags+=(-n)
    "${flags[@]}" "$DEST/" "$src/"
  fi
}

cmd_record() {
  require_clone
  git -C "$DEST" rev-parse HEAD > "$STATE_DIR/$MODULE.last"
  echo "RECORDED $(cat "$STATE_DIR/$MODULE.last")"
}

case "$CMD" in
  preflight) cmd_preflight ;;
  preview)   cmd_preview ;;
  apply)     cmd_apply ;;
  leakcheck) cmd_leakcheck ;;
  pullback)  cmd_pullback "$@" ;;
  record)    cmd_record ;;
  *) die "Unknown command: $CMD" ;;
esac
