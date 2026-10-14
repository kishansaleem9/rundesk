#!/bin/bash
# Give a worktree node_modules that build ITS OWN workspace packages
# (`found-30-sep/agent-worktrees-build-main-packages`).
#
#   bash scripts/e2e-lanes/link-worktree.sh <worktree> [--check]
#
# A worktree whose `node_modules` are symlinked wholesale to the main
# checkout's resolves `@rundesk/*` through pnpm's RELATIVE links inside them
# (`@rundesk/ui -> ../../../../packages/ui`), which land in the MAIN checkout.
# So a change to `packages/ui` made in the worktree was not in its bundle: an
# agent's first AFTER bundle held no fix, and a BEFORE bundle built from an
# older worktree carried the main checkout's work in progress (both measured,
# 30 September).
#
# This gives each workspace directory of the worktree a real `node_modules` of
# symlinks to the main checkout's entries, with `@rundesk/*` pointed at the
# worktree's own `packages/*` — what `wt-break.sh`'s `link_own_packages` does
# for the break worktrees. Idempotent. `--check` only reads: it fails naming
# every `@rundesk/*` link that does not resolve into the worktree.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
WT="${1:?usage: link-worktree.sh <worktree> [--check]}"
WT="$(cd "$WT" && pwd)"
MODE="${2:-link}"
REPO="${RUNDESK_MAIN:-/home/user/rundesk}"
if [ "$WT" = "$REPO" ]; then echo "link-worktree: $WT is the main checkout, not a worktree" >&2; exit 2; fi
DIRS=". apps/web apps/api packages/ui packages/db packages/feature-flags packages/eslint-config packages/imports"

if [ "$MODE" = "--check" ]; then
  bad=0; seen=0
  for dir in $DIRS; do
    [ -d "$WT/$dir/node_modules/@rundesk" ] || continue
    for link in "$WT/$dir/node_modules/@rundesk/"*; do
      [ -e "$link" ] || continue
      seen=$((seen + 1))
      target="$(readlink -f "$link")"
      case "$target" in
        "$WT"/packages/*) ;;
        *) echo "  ✗ $dir/node_modules/@rundesk/$(basename "$link") -> $target (not this worktree)"; bad=$((bad + 1)) ;;
      esac
    done
  done
  if [ "$seen" -eq 0 ]; then echo "link-worktree: no @rundesk link under $WT — nothing was linked"; exit 1; fi
  if [ "$bad" -gt 0 ]; then echo "link-worktree: $bad of $seen @rundesk link(s) leave the worktree"; exit 1; fi
  echo "link-worktree: ok — $seen @rundesk link(s), each into $WT/packages"
  exit 0
fi

for dir in $DIRS; do
  src="$REPO/$dir/node_modules"
  dst="$WT/$dir/node_modules"
  [ -d "$src" ] || continue
  [ -d "$WT/$dir" ] || continue
  # A symlink is borrowed and replaced; a real directory was made here before
  # (or installed on purpose) and is refreshed in place.
  if [ -L "$dst" ]; then rm -f "$dst"; fi
  mkdir -p "$dst"
  # `ls -A`, not a glob: `.bin` and `.pnpm` are dotted.
  ls -A "$src" 2>/dev/null | while IFS= read -r name; do
    [ "$name" = "@rundesk" ] && continue
    ln -sfn "$src/$name" "$dst/$name"
  done
  if [ -d "$src/@rundesk" ]; then
    mkdir -p "$dst/@rundesk"
    ls -A "$src/@rundesk" 2>/dev/null | while IFS= read -r pkg; do
      ln -sfn "$WT/packages/$pkg" "$dst/@rundesk/$pkg"
    done
  fi
done
echo "link-worktree: linked $WT (its @rundesk/* now resolve to its own packages)"
exit 0
exit
}
