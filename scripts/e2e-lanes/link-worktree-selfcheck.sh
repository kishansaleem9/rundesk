#!/bin/bash
# A worktree linked by link-worktree.sh builds its own packages
# (`found-30-sep/agent-worktrees-build-main-packages`).
#
#   bash scripts/e2e-lanes/link-worktree-selfcheck.sh [--mutate]
#
# Makes a throwaway tree with the workspace's directories, links it, and holds
# every `@rundesk/*` link to resolving into that tree while the other entries
# still come from the main checkout. With --mutate, a copy of the helper that
# points `@rundesk/*` at the main checkout's packages — what wholesale links
# do — must be caught by `--check`. No lane, no API.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
T="$(mktemp -d /tmp/link-worktree-selfcheck.XXXXXX)"
trap 'rm -rf "$T"' EXIT
for dir in apps/web apps/api packages/ui packages/db packages/feature-flags packages/eslint-config packages/imports; do mkdir -p "$T/$dir"; done
fail=0
check () { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }

RUNDESK_MAIN="$REPO" bash "$HERE/link-worktree.sh" "$T" > /dev/null
check "the web's @rundesk/ui resolves into the worktree" '[ "$(readlink -f "$T/apps/web/node_modules/@rundesk/ui")" = "$T/packages/ui" ]'
check "and the api's @rundesk/db" '[ "$(readlink -f "$T/apps/api/node_modules/@rundesk/db")" = "$T/packages/db" ]'
check "while its other packages still come from the main checkout" '[ "$(readlink -f "$T/apps/web/node_modules/react")" = "$(readlink -f "$REPO/apps/web/node_modules/react")" ]'
check "and --check agrees" 'RUNDESK_MAIN="$REPO" bash "$HERE/link-worktree.sh" "$T" --check > /dev/null'
check "linking twice changes nothing" 'RUNDESK_MAIN="$REPO" bash "$HERE/link-worktree.sh" "$T" > /dev/null && [ "$(readlink -f "$T/apps/web/node_modules/@rundesk/ui")" = "$T/packages/ui" ]'

# THE STATE AGENTS WERE IN: node_modules symlinked wholesale to the main
# checkout's, whose relative @rundesk links land in the main checkout.
W2="$T/wholesale"; mkdir -p "$W2/apps/web" "$W2/packages/ui"
ln -s "$REPO/apps/web/node_modules" "$W2/apps/web/node_modules"
check "a worktree linked wholesale is caught by --check" '! RUNDESK_MAIN="$REPO" bash "$HERE/link-worktree.sh" "$W2" --check > /dev/null'
check "and linking it gives the web its own @rundesk/ui" 'RUNDESK_MAIN="$REPO" bash "$HERE/link-worktree.sh" "$W2" > /dev/null && [ "$(readlink -f "$W2/apps/web/node_modules/@rundesk/ui")" = "$W2/packages/ui" ]'

if [ "${1:-}" = "--mutate" ]; then
  M="$T/mutant-link-worktree.sh"
  sed 's|ln -sfn "$WT/packages/$pkg" "$dst/@rundesk/$pkg"|ln -sfn "$REPO/packages/$pkg" "$dst/@rundesk/$pkg"|' "$HERE/link-worktree.sh" > "$M"
  if cmp -s "$M" "$HERE/link-worktree.sh"; then echo "  FAIL the mutation found no anchor"; fail=1; else
    rm -rf "$T/apps/web/node_modules" "$T/apps/api/node_modules"
    RUNDESK_MAIN="$REPO" bash "$M" "$T" > /dev/null
    if RUNDESK_MAIN="$REPO" bash "$HERE/link-worktree.sh" "$T" --check > /dev/null; then
      echo "  FAIL links into the main checkout's packages passed --check"; fail=1
    else
      echo "  ok   links into the main checkout's packages (what wholesale links do) are caught"
    fi
  fi
fi
[ "$fail" -eq 0 ] && echo "ok link-worktree" || echo "not ok link-worktree"
exit "$fail"
exit
}
