#!/usr/bin/env bash
# Prove, on the machine that actually deploys, that a publish carries the
# previous release's chunks forward — using real builds, not fixtures.
#
# test/deploy/publish-web-dist.test.sh covers the publish logic with synthetic
# files. That is necessary but not sufficient: it says nothing about whether a
# real `vite build` on this host produces the file layout the logic expects, and
# it was a gap exactly like that — trusting a unit-level check instead of the
# outcome — that let the `-mtime +14` prune ship and silently delete everything
# it had just carried over.
#
# So this builds three genuine releases, publishes each through the real
# publish_web_dist, and asserts what survives:
#
#   release 1 → publish        chunk P1 on disk
#   release 2 → publish        P1 AND P2 on disk        ← the carry-forward
#   release 3 → publish        P2 AND P3, P1 gone       ← exactly two generations
#
# It never touches the live apps/web/dist: publishing happens in a scratch tree.
# Source files are perturbed to move the chunk hashes and restored from git
# afterwards (also on interrupt).
#
#   bash test/deploy/carry-forward-live.sh
#
# Uses docker buildx when a daemon is reachable, which is what production does.
# Falls back to running vite directly so the same script is useful on a dev box.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB="$REPO/apps/web"
PROBE_SRC="apps/web/src/components/command-palette.tsx"

passed=0
failed=0
check() {
  if [ "$1" = ok ]; then
    passed=$((passed + 1)); printf '  PASS  %s\n' "$2"
  else
    failed=$((failed + 1)); printf '  FAIL  %s%s\n' "$2" "${3:+ — $3}"
  fi
}

# Never risk clobbering someone's work in progress.
if ! git -C "$REPO" diff --quiet -- "$PROBE_SRC"; then
  echo "✗ $PROBE_SRC has uncommitted changes — commit or stash them first"
  exit 2
fi

WORK="$(mktemp -d)"
restore() {
  git -C "$REPO" checkout -- "$PROBE_SRC" 2>/dev/null || true
  rm -rf "$WORK"
}
trap restore EXIT

if timeout 25 docker info >/dev/null 2>&1; then
  BUILDER=docker
else
  BUILDER=vite
fi
echo "builder: $BUILDER"

# Build a release into $1. $2 is a marker that moves the chunk hashes, the way
# any real code change would. It has to be a statement, not a comment —
# minification strips comments and the hash would not move.
build_release() {
  local dest="$1" marker="$2"
  printf "\nconsole.debug('carry-forward probe %s')\n" "$marker" >> "$REPO/$PROBE_SRC"
  rm -rf "$dest"
  if [ "$BUILDER" = docker ]; then
    ( cd "$REPO" && docker buildx build -f deploy/Dockerfile.web --target export \
        --output "type=local,dest=$dest" . ) >/dev/null 2>&1
  else
    ( cd "$WEB" && pnpm exec vite build --outDir "$dest" --emptyOutDir ) >/dev/null 2>&1
  fi
  local status=$?
  git -C "$REPO" checkout -- "$PROBE_SRC"
  if [ $status -ne 0 ] || [ ! -s "$dest/index.html" ]; then
    echo "✗ build $marker failed"
    exit 1
  fi
}

# Publish $1 through the real function, in a scratch tree — not the live dist.
mkdir -p "$WORK/apps/web"
# shellcheck source=/dev/null
source "$REPO/deploy/lib/publish-web-dist.sh"
publish() {
  # Age everything already published well past any plausible time-based prune.
  # This is the condition production was in — the preceding build was 15 days
  # old — and it is what the `-mtime +14` version silently failed on.
  if [ -d "$WORK/apps/web/dist" ]; then
    find "$WORK/apps/web/dist" -exec touch -d '60 days ago' {} +
  fi
  rm -rf "$WORK/apps/web/dist.new"
  cp -a "$1" "$WORK/apps/web/dist.new"
  ( cd "$WORK" && publish_web_dist )
}

palette_of() { ls "$1/assets" | grep '^command-palette-' | head -1; }
live_assets() { ls "$WORK/apps/web/dist/assets"; }
has_asset() { [ -e "$WORK/apps/web/dist/assets/$1" ]; }

echo
echo "1. release one"
build_release "$WORK/build-1" one
P1="$(palette_of "$WORK/build-1")"
publish "$WORK/build-1"
N1="$(live_assets | wc -l)"
check "$(has_asset "$P1" && echo ok || echo no)" "P1 ($P1) is served"

echo
echo "2. release two — the carry-forward"
build_release "$WORK/build-2" two
P2="$(palette_of "$WORK/build-2")"
if [ "$P1" = "$P2" ]; then
  echo "✗ the two builds produced the same chunk hash — the probe did not take"
  exit 1
fi
publish "$WORK/build-2"
N2="$(live_assets | wc -l)"
check "$(has_asset "$P2" && echo ok || echo no)" "P2 ($P2) is served"
check "$(has_asset "$P1" && echo ok || echo no)" "P1 survived the deploy — a tab open across it still resolves"
check "$([ "$N2" -gt "$N1" ] && echo ok || echo no)" "the asset count grew ($N1 → $N2)" "carry-forward added nothing"
check "$(! grep -qx "$P1" "$WORK/apps/web/.build-assets" && echo ok || echo no)" \
  "the manifest records only this build, so generations cannot accumulate"

echo
echo "3. release three — two generations, not three"
build_release "$WORK/build-3" three
P3="$(palette_of "$WORK/build-3")"
publish "$WORK/build-3"
N3="$(live_assets | wc -l)"
check "$(has_asset "$P3" && echo ok || echo no)" "P3 ($P3) is served"
check "$(has_asset "$P2" && echo ok || echo no)" "P2 survived"
check "$(! has_asset "$P1" && echo ok || echo no)" "P1 has aged out ($N3 assets on disk)"

echo
echo "4. the live deploy tree was never touched"
check "$([ ! -e "$WEB/dist.new" ] && echo ok || echo no)" "no dist.new beside the live dist"
check "$([ ! -e "$WEB/assets.prev" ] && echo ok || echo no)" "no assets.prev beside the live dist"
check "$(git -C "$REPO" diff --quiet -- "$PROBE_SRC" && echo ok || echo no)" "the probed source file is back as it was"

echo
printf '%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
