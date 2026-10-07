#!/bin/bash
# Each lane script works on the tree it is in, not the main checkout
# (`found-5-oct/lane-scripts-build-the-main-checkout`):
#
#   bash scripts/e2e-lanes/lane-root-selfcheck.sh [--mutate]
#
#   · build-api.sh, verify.sh, refresh-dists.sh, fleet-sync.sh and fleet-up.sh
#     take their root from where they are, and none names /home/user/rundesk
#     on a line that is not a comment;
#   · copied into a stand-in tree, with `pnpm`, `mkdir` and `touch` stood in
#     for so that nothing is built or stamped, build-api.sh builds and stamps
#     that tree, and refresh-dists.sh builds that tree's web and records the
#     hash of that tree's sources;
#   · the stand-in's verify.sh looks for a suite in the stand-in: one only this
#     checkout has is refused there as missing (exit 2), as one only the
#     stand-in has is refused here.
#
# With --mutate, each script is given the main checkout back as its root, as
# it had, and the cases must catch each one. No lane and no API. What verify.sh
# does with a lane served from its own tree needs one: it was measured on a
# worktree's lane (the ledger's closing of the item above).
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
HERE="$(cd "$(dirname "$0")" && pwd -P)"
REPO="$(cd "$HERE/../.." && pwd -P)"
. "$HERE/lane-env.sh"
T="$(mktemp -d /tmp/lane-root-selfcheck.XXXXXX)"
STUBS="$T.stubs"
LOG="$T.log"
# A lane nobody has: its bundle is made here and removed.
LANE=97
OUT="/tmp/claude-0/dist-$LANE"
trap 'rm -rf "$T" "$STUBS" "$LOG" "$OUT" "$OUT.lock" "$OUT.log"' EXIT
mkdir -p /tmp/claude-0 "$STUBS" "$T/scripts/e2e-lanes" "$T/apps/web/src" "$T/test/e2e"
cp "$HERE"/*.sh "$T/scripts/e2e-lanes/"
( cd "$T" && git init -q && git config user.email selfcheck@rundesk.invalid && git config user.name selfcheck \
  && printf 'export const a = 1\n' > apps/web/src/a.ts && : > test/e2e/only-in-the-stand-in.mjs \
  && git add -A && git commit -qm base )

# The stand-ins: each writes where it ran and what it was asked, and builds nothing.
cat > "$STUBS/pnpm" <<'EOF'
#!/bin/bash
echo "pnpm in $PWD: $*" >> "$STUB_LOG"
prev=""; for a in "$@"; do [ "$prev" = "--outDir" ] && /bin/mkdir -p "$a"; prev="$a"; done
exit 0
EOF
cat > "$STUBS/touch" <<'EOF'
#!/bin/bash
echo "touch in $PWD: $*" >> "$STUB_LOG"
EOF
cat > "$STUBS/mkdir" <<'EOF'
#!/bin/bash
echo "mkdir in $PWD: $*" >> "$STUB_LOG"
[ "$*" = "-p apps/api/dist" ] && exit 0
exec /bin/mkdir "$@"
EOF
chmod +x "$STUBS"/*

run_cases () {
  local bad=0 f n ran stray want got out code
  local S="$T/scripts/e2e-lanes"
  # 1. Each takes its root from where it is, and names no other.
  for f in build-api verify refresh-dists fleet-sync fleet-up; do
    n=$(grep -v '^[[:space:]]*#' "$S/$f.sh" | grep -c '/home/user/rundesk')
    if [ "$n" -eq 0 ] && grep -qF 'dirname "${BASH_SOURCE[0]}")/../..' "$S/$f.sh"; then
      echo "  ok   $f.sh takes its root from where it is, and names no other"
    else
      echo "  FAIL $f.sh names /home/user/rundesk on $n line(s) that are not comments, or takes no root from where it is"; bad=1
    fi
  done
  # 2. build-api.sh builds and stamps the tree it is in.
  : > "$LOG"
  PATH="$STUBS:$PATH" STUB_LOG="$LOG" bash "$S/build-api.sh" > /dev/null 2>&1
  ran=$(wc -l < "$LOG"); stray=$(grep -cvF "in $T:" "$LOG")
  if [ "$ran" -ge 3 ] && [ "$stray" -eq 0 ]; then
    echo "  ok   build-api.sh builds and stamps the tree it is in"
  else
    echo "  FAIL build-api.sh ran $stray of its $ran steps outside the tree it is in:"; sed 's/^/         /' "$LOG"; bad=1
  fi
  # 3. refresh-dists.sh builds the tree's web, and records the tree's sources.
  : > "$LOG"; rm -rf "$OUT"
  PATH="$STUBS:$PATH" STUB_LOG="$LOG" bash "$S/refresh-dists.sh" "$LANE" > /dev/null 2>&1
  want=$(web_sources_hash "$T"); got=$(cat "$OUT/.sources-hash" 2>/dev/null)
  if grep -qF "pnpm in $T: -C apps/web exec vite build" "$LOG" && [ -n "$want" ] && [ "$got" = "$want" ]; then
    echo "  ok   refresh-dists.sh builds the web of the tree it is in, and records that tree's sources"
  else
    echo "  FAIL refresh-dists.sh built in $(sed -n 's/^pnpm in \([^:]*\):.*/\1/p' "$LOG" | head -1), and recorded ${got:-nothing} for a tree whose sources are $want"; bad=1
  fi
  # 4. verify.sh looks for a suite in the tree it is in.
  out=$(bash "$S/verify.sh" task-attachments "$LANE" 2>&1); code=$?
  if [ "$code" -eq 2 ] && grep -qF "no test/e2e/task-attachments.mjs in $T" <<< "$out"; then
    echo "  ok   the stand-in's verify.sh refuses a suite only this checkout has, as missing from the stand-in"
  else
    echo "  FAIL the stand-in's verify.sh, asked for a suite only this checkout has, answered $code: $(head -1 <<< "$out")"; bad=1
  fi
  out=$(bash "$HERE/verify.sh" only-in-the-stand-in "$LANE" 2>&1); code=$?
  if [ "$code" -eq 2 ] && grep -qF "no test/e2e/only-in-the-stand-in.mjs in $REPO" <<< "$out"; then
    echo "  ok   and this checkout's refuses the stand-in's suite, as missing from this checkout"
  else
    echo "  FAIL this checkout's verify.sh, asked for the stand-in's suite, answered $code: $(head -1 <<< "$out")"; bad=1
  fi
  return $bad
}

echo "each lane script works on its own tree, on a stand-in:"
if ! run_cases; then echo "lane-root selfcheck FAILED"; exit 1; fi

if [ "${1:-}" = "--mutate" ]; then
  echo
  echo "and each with the main checkout as its root, as it was, which the cases must catch:"
  fails=0
  mutate () {
    local f=$1 from=$2 to=$3
    cp "$HERE/$f.sh" "$T/scripts/e2e-lanes/$f.sh.orig"
    sed "s#$from#$to#" "$HERE/$f.sh" > "$T/scripts/e2e-lanes/$f.sh"
    if cmp -s "$HERE/$f.sh" "$T/scripts/e2e-lanes/$f.sh"; then echo "  NOT CAUGHT: $f.sh, whose mutation found no anchor"; fails=1
    elif run_cases > "$T.m.log" 2>&1; then echo "  NOT CAUGHT: $f.sh with the main checkout as its root"; fails=1
    else echo "  caught: $f.sh with the main checkout as its root"; fi
    mv "$T/scripts/e2e-lanes/$f.sh.orig" "$T/scripts/e2e-lanes/$f.sh"
  }
  ROOT_LINE='cd "$(dirname "${BASH_SOURCE\[0\]}")/../.." || exit 1'
  mutate build-api "$ROOT_LINE" 'cd /home/user/rundesk'
  mutate refresh-dists "$ROOT_LINE" 'cd /home/user/rundesk'
  mutate verify '^ROOT=.*' 'ROOT=/home/user/rundesk'
  mutate fleet-sync '^R=.*' 'R=/home/user/rundesk'
  mutate fleet-up '^R=.*' 'R=/home/user/rundesk'
  rm -f "$T.m.log"
  if [ "$fails" -ne 0 ]; then echo "lane-root selfcheck FAILED: a mutation went uncaught"; exit 1; fi
fi
echo "lane-root selfcheck: ok"
exit
}
