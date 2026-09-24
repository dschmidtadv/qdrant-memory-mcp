#!/usr/bin/env bash
#
# sync-claude-skills.sh
#
# Wires this repo's agent/skills/ together with Claude's personal skill
# directory at ~/.claude/skills/.
#
#   copy  Mirror ~/.claude/skills/synced/<bucket>/ into agent/skills/.
#         Any file that is already newer in the repo is left alone.
#         Anything overwritten is saved under .skills-backup/<timestamp>/.
#
#   link  Symlink each SKILL.md-bearing directory in agent/skills/ into
#         ~/.claude/skills/ so Claude Code discovers it. The synced/
#         subdirectory is never touched, so the desktop app keeps syncing
#         account skills normally.
#
# Dry run by default. Nothing changes until you pass --apply.
#
#   ./scripts/sync-claude-skills.sh              # show what would happen
#   ./scripts/sync-claude-skills.sh --apply
#   ./scripts/sync-claude-skills.sh --link-only --apply
#   ./scripts/sync-claude-skills.sh --unlink --apply
#   ./scripts/sync-claude-skills.sh --pull --apply    # bring new/local-only skills
#                                                      # from ~/.claude/skills/ INTO the repo
#
# Written for macOS /bin/bash 3.2 — no mapfile, no associative arrays.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/agent/skills"
CLAUDE_SKILLS="$HOME/.claude/skills"
SYNCED="$CLAUDE_SKILLS/synced"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$REPO_ROOT/.skills-backup/$STAMP"

APPLY=0
DO_COPY=1
DO_LINK=1
UNLINK=0
PULL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)     APPLY=1 ;;
    --copy-only) DO_LINK=0 ;;
    --link-only) DO_COPY=0 ;;
    --unlink)    UNLINK=1; DO_COPY=0; DO_LINK=0 ;;
    --pull)      PULL=1; DO_COPY=0; DO_LINK=0 ;;
    -h|--help)   sed -n '3,26p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$APPLY" -eq 1 ]; then MODE="APPLY"; else MODE="DRY RUN"; fi
echo "=== sync-claude-skills.sh  [$MODE] ==="
echo "repo skills : $SKILLS_DIR"
echo "claude dir  : $CLAUDE_SKILLS"
echo

if [ ! -d "$SKILLS_DIR" ]; then
  echo "error: $SKILLS_DIR does not exist" >&2
  exit 1
fi
if [ ! -d "$CLAUDE_SKILLS" ]; then
  echo "error: $CLAUDE_SKILLS does not exist — is the Claude desktop app installed?" >&2
  exit 1
fi

# Guard against ~/.claude/skills being (or resolving through) a symlink that
# points back at agent/skills itself. If the two ever alias the same real
# directory, "target" and "source" become the same path under a different
# name: rm -rf on one deletes the other, and the follow-up ln -s recreates
# it as a symlink pointing at itself. That happened once already — never
# again.
REAL_SKILLS_DIR="$(cd "$SKILLS_DIR" 2>/dev/null && pwd -P)"
REAL_CLAUDE_SKILLS="$(cd "$CLAUDE_SKILLS" 2>/dev/null && pwd -P)"
if [ -n "$REAL_SKILLS_DIR" ] && [ "$REAL_SKILLS_DIR" = "$REAL_CLAUDE_SKILLS" ]; then
  echo "error: ~/.claude/skills and agent/skills already resolve to the same" >&2
  echo "       directory (one is a symlink to the other). There is nothing" >&2
  echo "       to copy, link, or pull — they are already unified. Refusing" >&2
  echo "       to run, to avoid recreating self-referential symlinks." >&2
  exit 1
fi

# ---------------------------------------------------------------- unlink ----
if [ "$UNLINK" -eq 1 ]; then
  echo "--- removing symlinks that point into this repo ---"
  found=0
  for target in "$CLAUDE_SKILLS"/*; do
    [ -L "$target" ] || continue
    dest="$(readlink "$target")"
    case "$dest" in
      "$SKILLS_DIR"/*)
        found=$((found + 1))
        echo "  unlink $(basename "$target")"
        [ "$APPLY" -eq 1 ] && rm "$target"
        ;;
    esac
  done
  [ "$found" -eq 0 ] && echo "  (none found)"
  echo
  exit 0
fi

# -------------------------------------------------------------------- pull ----
if [ "$PULL" -eq 1 ]; then
  echo "--- pull: real directories in ~/.claude/skills/ -> agent/skills/ ---"
  echo "(anything that differs from the repo is left alone for you to review)"
  echo

  new_count=0; same_count=0; diff_count=0

  for target in "$CLAUDE_SKILLS"/*/; do
    [ -d "$target" ] || continue
    name="$(basename "${target%/}")"
    [ "$name" = "synced" ] && continue
    [ -L "${target%/}" ] && continue   # already a symlink — nothing to pull

    src_dir="$SKILLS_DIR/$name"

    real_target="$(cd "${target%/}" 2>/dev/null && pwd -P)"
    real_src="$(cd "$src_dir" 2>/dev/null && pwd -P)"
    if [ -n "$real_target" ] && [ "$real_target" = "$real_src" ]; then
      echo "  skip  $name — target and repo copy are the same directory, refusing to touch it"
      continue
    fi

    if [ ! -e "$src_dir" ]; then
      new_count=$((new_count + 1))
      echo "  new   $name — not in repo yet, copying in and linking back"
      if [ "$APPLY" -eq 1 ]; then
        cp -a "${target%/}" "$src_dir"
        rm -rf "${target%/}"
        ln -s "$src_dir" "${target%/}"
      fi
      continue
    fi

    diff_out="$(diff -rq --exclude=.DS_Store "${target%/}" "$src_dir" 2>&1)"
    if [ -z "$diff_out" ]; then
      same_count=$((same_count + 1))
      echo "  same  $name — identical to the repo copy, replacing with a symlink"
      if [ "$APPLY" -eq 1 ]; then
        rm -rf "${target%/}"
        ln -s "$src_dir" "${target%/}"
      fi
    else
      diff_count=$((diff_count + 1))
      echo "  DIFF  $name — differs from the repo copy, left alone:"
      echo "$diff_out" | sed 's/^/          /'
    fi
  done

  echo
  echo "  $new_count new, $same_count identical (symlinked), $diff_count differ (review by hand)"
  echo
  if [ "$diff_count" -gt 0 ]; then
    echo "  For each DIFF above, decide which side wins, e.g.:"
    echo "    diff -ru ~/.claude/skills/<name> agent/skills/<name>"
    echo "    # then either:"
    echo "    rsync -a --delete ~/.claude/skills/<name>/ agent/skills/<name>/   # repo takes local's changes"
    echo "    # or just keep the repo version and re-run --pull to symlink once they match"
  fi
  echo
  if [ "$APPLY" -eq 0 ]; then
    echo "Dry run — nothing changed. Re-run with --pull --apply to commit."
  else
    echo "Done. Restart Claude Code / the desktop app to pick up new skills."
  fi
  exit 0
fi

# ------------------------------------------------------------------ copy ----
if [ "$DO_COPY" -eq 1 ]; then
  echo "--- copy: synced account skills -> agent/skills/ ---"

  if [ ! -d "$SYNCED" ]; then
    echo "  no $SYNCED — nothing to copy"
  else
    bucket_count=0
    for bucket in "$SYNCED"/*; do
      [ -d "$bucket" ] || continue
      bucket_count=$((bucket_count + 1))
      echo "  bucket: $(basename "$bucket")"

      RSYNC_FLAGS="-a --update --itemize-changes --exclude=manifest.json --exclude=.DS_Store"
      if [ "$APPLY" -eq 1 ]; then
        mkdir -p "$BACKUP_DIR"
        rsync $RSYNC_FLAGS --backup --backup-dir="$BACKUP_DIR" \
              "$bucket"/ "$SKILLS_DIR"/
      else
        rsync $RSYNC_FLAGS --dry-run "$bucket"/ "$SKILLS_DIR"/ | sed 's/^/    /'
      fi
    done
    [ "$bucket_count" -eq 0 ] && echo "  (no buckets under synced/)"
  fi

  if [ "$APPLY" -eq 1 ] && [ -d "$BACKUP_DIR" ]; then
    if [ -n "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
      echo "  overwritten files backed up to: ${BACKUP_DIR#$REPO_ROOT/}"
    else
      rmdir "$BACKUP_DIR" 2>/dev/null
      rmdir "$REPO_ROOT/.skills-backup" 2>/dev/null
    fi
  fi
  echo
fi

# ------------------------------------------------------------------ link ----
if [ "$DO_LINK" -eq 1 ]; then
  echo "--- link: agent/skills/ -> ~/.claude/skills/ ---"

  linked=0; skipped=0; nested=0

  for d in "$SKILLS_DIR"/*/; do
    [ -d "$d" ] || continue
    name="$(basename "$d")"

    # Link it if it's a skill itself (has SKILL.md), or a container that
    # bundles nested skills one level down (e.g. document-skills/docx,
    # document-skills/pdf) — one symlink for the whole container is enough,
    # whatever reads it recurses the same way it always did. Only skip
    # directories that are neither.
    if [ ! -f "$d/SKILL.md" ]; then
      if ls "$d"*/SKILL.md >/dev/null 2>&1; then
        nested=$((nested + 1))
        echo "  (nested container — linking as one directory, like any other skill)"
      else
        echo "  skip  $name — no SKILL.md, not a skill"
        skipped=$((skipped + 1))
        continue
      fi
    fi

    # A skill of the same name already coming from the account sync would
    # collide, so leave it alone rather than shadowing it.
    if [ -d "$SYNCED" ] && ls -d "$SYNCED"/*/"$name" >/dev/null 2>&1; then
      echo "  skip  $name — same name already synced from your account"
      skipped=$((skipped + 1))
      continue
    fi

    target="$CLAUDE_SKILLS/$name"
    src="${d%/}"

    if [ -L "$target" ]; then
      if [ "$(readlink "$target")" = "$src" ]; then
        echo "  ok    $name — already linked"
      else
        echo "  relink $name — points at $(readlink "$target")"
        if [ "$APPLY" -eq 1 ]; then rm "$target"; ln -s "$src" "$target"; fi
        linked=$((linked + 1))
      fi
    elif [ -e "$target" ]; then
      echo "  skip  $name — a real directory already exists there"
      skipped=$((skipped + 1))
    else
      echo "  link  $name"
      [ "$APPLY" -eq 1 ] && ln -s "$src" "$target"
      linked=$((linked + 1))
    fi
  done

  echo
  echo "  $linked to link, $skipped skipped ($nested nested container(s))"
fi

echo
if [ "$APPLY" -eq 0 ]; then
  echo "Dry run — nothing changed. Re-run with --apply to commit."
else
  echo "Done. Restart Claude Code / the desktop app to pick up new skills."
fi
