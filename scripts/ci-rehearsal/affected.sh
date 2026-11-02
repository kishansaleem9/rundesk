#!/bin/bash
# Rehearse what a push can affect, from what is committed, and record it so CI
# trusts it (the owner, 2 November: "rehearse everything locally and only push
# the code, so CI is green without rehearsing it all again").
#
#   bash scripts/ci-rehearsal/affected.sh [BASE] [OUT]
#
# BASE is what the remote branch holds now (default: the upstream, `@{u}`).
# The selection is `scripts/ci-affected.mjs` over BASE..HEAD — the answer CI's
# `changes` job gives that push — and the steps run are the ones CI would run
# for it: all of Verify; the browser suites if the web can be affected; the
# Postgres harnesses' setup and the selected suites (every one, when
# everything is wanted), with the made-sweep's mutations only if its own code
# changed. When every step that ran passed, `docs/rehearsals/latest.json`
# names HEAD, the selection and the results: commit it, push it with the
# code, and CI runs only Verify's quick half.
#
# Exits 0 only when every step of every job it ran passed.
{
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
BASE=${1:-$(git -C "$REPO" rev-parse '@{u}' 2>/dev/null)}
OUT=${2:-/home/runner/ci-rh/aff-$(date +%Y%m%d-%H%M)}
HEAD_SHA=$(git -C "$REPO" rev-parse HEAD)
if [ -z "$BASE" ]; then echo "no BASE, and the branch has no upstream to take it from"; exit 2; fi
if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]; then
  echo "the tree has uncommitted changes: a rehearsal is of what is committed"; exit 2
fi

missing=
[ "$(id -u)" = 0 ] || missing="$missing root (for namespaces and mounts);"
[ -x /usr/lib/postgresql/16/bin/initdb ] || missing="$missing Postgres 16 server binaries;"
python3 -c 'import pyroute2, yaml' 2>/dev/null || missing="$missing python3 with pyroute2 and yaml;"
if [ -n "$missing" ]; then echo "cannot rehearse here, missing:$missing"; exit 2; fi

# The rehearsal runs the steps a trusted push would NOT run, so it never asks
# for trust itself: `trusted` is false whatever an older record says.
SEL=$(cd "$REPO" && node scripts/ci-affected.mjs --event pull_request --action synchronize \
  --base "$BASE" --head "$HEAD_SHA" --json) || { echo "the selection failed"; exit 1; }
SEL=$(node -e 'const s = JSON.parse(process.argv[1]); s.trusted = false; console.log(JSON.stringify(s))' "$SEL")
field () { node -e 'console.log(JSON.parse(process.argv[1])[process.argv[2]])' "$SEL" "$1"; }
echo "rehearsing ${BASE:0:8}..${HEAD_SHA:0:8}: $SEL"
(cd "$REPO" && node scripts/ci-affected.mjs --event pull_request --action synchronize --base "$BASE" --head "$HEAD_SHA" | head -40)
if [ "$(field code)" != true ]; then echo "nothing but prose changed: CI runs no heavy job, so there is nothing to rehearse"; exit 0; fi

mkdir -p "$OUT"
for j in verify postgres browser; do
  bash "$HERE/checkout.sh" "/home/runner/work-$j" || exit 1
done
echo "rehearsing into $OUT"
(
  bash "$HERE/launch.sh" verify 2,3 none /home/runner/work-verify "$OUT/verify" --changes "$SEL" > "$OUT/verify.out" 2>&1
  if [ "$(field web)" = true ]; then
    bash "$HERE/launch.sh" browser-suites 2,3 none /home/runner/work-browser "$OUT/browser" --changes "$SEL" > "$OUT/browser.out" 2>&1
  fi
) &
if [ "$(field harness)" = true ]; then
  bash "$HERE/launch.sh" postgres-harnesses 0,1 private-pg /home/runner/work-postgres "$OUT/postgres" \
    --step-timeout 900 --changes "$SEL" > "$OUT/postgres.out" 2>&1
fi
wait

status=0
results='{}'
for j in verify browser postgres; do
  [ -f "$OUT/$j.out" ] || continue
  sed -n '/ steps passed in /,$p' "$OUT/$j.out"
  grep -q ' FAILED \[' "$OUT/$j.out" && status=1
  line=$(grep -m1 ' steps passed in ' "$OUT/$j.out") || { echo "$j: no summary, so it did not finish"; status=1; continue; }
  results=$(node -e 'const r = JSON.parse(process.argv[1]); r[process.argv[2]] = process.argv[3]; console.log(JSON.stringify(r))' \
    "$results" "$j" "$(echo "$line" | sed -E 's/^[^:]*: ([0-9]+ of [0-9]+) steps.*/\1/')")
done
if [ "$status" = 0 ]; then
  mkdir -p "$REPO/docs/rehearsals"
  node "$HERE/record.mjs" "$HEAD_SHA" "$BASE" "$SEL" "$results" "$OUT" > "$REPO/docs/rehearsals/latest.json"
  echo "recorded: docs/rehearsals/latest.json — commit it with the code it names, and push"
fi
exit $status
}
