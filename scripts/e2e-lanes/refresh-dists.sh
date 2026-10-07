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
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -u
# The tree this file is in, as `build-api.sh` (`found-5-oct/lane-scripts-build-the-main-checkout`):
# a worktree's copy builds the worktree's web and records its sources.
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
# The bundle lock (`dist_lock_exclusive`): a build waits for the runs reading
# this bundle, and a second build of the same lane waits for the first.
. "$PWD/scripts/e2e-lanes/lane-env.sh"

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
# What the bundles are built from, read before any build starts: a source that
# changes during one is then a mismatch `verify.sh` refuses, never a match
# (`web_sources_hash`; `found-6-oct/verify-takes-a-bundle-of-other-sources-as-fresh`).
FROM=$(web_sources_hash)

for k in "${LANES[@]}"; do
  out="/tmp/claude-0/dist-$k"
  if ! dist_lock_exclusive "$out"; then
    echo "lane $k: $out has been in use by a run or another build for 20 minutes — not rebuilt"
    exit 1
  fi
  if pnpm -C apps/web exec vite build --outDir "$out" --emptyOutDir > "/tmp/claude-0/dist-$k.log" 2>&1; then
    echo "$FROM" > "$out/.sources-hash"
    echo "lane $k: $out rebuilt"
  else
    echo "lane $k: BUILD FAILED"
    tail -5 "/tmp/claude-0/dist-$k.log"
    exit 1
  fi
  dist_lock_release
done
echo "${#LANES[@]} bundle(s) refreshed"
exit
}
