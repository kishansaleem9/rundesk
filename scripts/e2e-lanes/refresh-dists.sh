#!/bin/bash
# Rebuild the per-lane web bundles.
#
#   refresh-dists.sh            every /tmp/claude-0/dist-<k> that already exists
#   refresh-dists.sh "1 2 3"    those lanes, creating them if absent
#
# `verify.sh` prefers a lane's own bundle over the shared `apps/web/dist` so
# that concurrent agents cannot rebuild each other's tree mid-run. Nothing ages
# those bundles out, though, so a lane that has not been rebuilt since the last
# web change reports on code that no longer exists — which is why `verify.sh`
# now REFUSES on a stale one rather than running. This is the one line that
# clears it.
#
# ONE AT A TIME, ON PURPOSE. Seven simultaneous `vite build`s on four cores is
# slower than seven sequential ones and can exhaust memory; the whole point of
# the refusal is that the rebuild happens once, deliberately, rather than seven
# times by accident.
set -u
cd /home/user/rundesk

if [ $# -ge 1 ]; then
  LANES=($1)
else
  LANES=()
  for d in /tmp/claude-0/dist-*; do
    [ -f "$d/index.html" ] || continue
    LANES+=("${d##*/dist-}")
  done
fi

[ ${#LANES[@]} -eq 0 ] && { echo "no lane bundles to refresh"; exit 0; }
echo "refreshing: ${LANES[*]}"

for k in "${LANES[@]}"; do
  out="/tmp/claude-0/dist-$k"
  if pnpm -C apps/web exec vite build --outDir "$out" --emptyOutDir > "/tmp/claude-0/dist-$k.log" 2>&1; then
    echo "lane $k: $out rebuilt"
  else
    echo "lane $k: BUILD FAILED"
    tail -5 "/tmp/claude-0/dist-$k.log"
    exit 1
  fi
done
echo "${#LANES[@]} bundle(s) refreshed"
