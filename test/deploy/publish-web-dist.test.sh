#!/usr/bin/env bash
# Exercises deploy/lib/publish-web-dist.sh across three releases.
#
# The rule it must hold: exactly two generations of chunks live on disk — this
# build's and the previous build's. That is what lets a tab opened before a
# deploy still fetch the chunks its index.html names.
#
# This exists because the logic has been wrong twice. First it deleted the
# previous release's chunks outright (`rm -rf apps/web/dist`). Then it carried
# them over and pruned them one line later with `find -mtime +14 -delete`,
# which on 20 Aug 2026 matched every file because the preceding build was 15
# days old — the carry-forward looked implemented and did nothing.
#
#   bash test/deploy/publish-web-dist.test.sh
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

passed=0
failed=0
check() {
  if [ "$1" = "ok" ]; then
    passed=$((passed + 1))
    printf '  PASS  %s\n' "$2"
  else
    failed=$((failed + 1))
    printf '  FAIL  %s%s\n' "$2" "${3:+ — $3}"
  fi
}
assert_has() {
  local dir="$1" name="$2" label="$3"
  if [ -e "$dir/$name" ]; then check ok "$label"; else check no "$label" "$name missing"; fi
}
assert_lacks() {
  local dir="$1" name="$2" label="$3"
  if [ -e "$dir/$name" ]; then check no "$label" "$name still present"; else check ok "$label"; fi
}

cd "$WORK"
mkdir -p apps/web
# shellcheck source=/dev/null
source "$REPO/deploy/lib/publish-web-dist.sh"

# A build: index.html plus a set of content-hashed chunks. `shared.js` is in
# every release (unchanged source keeps its hash); `app-N.js` moves each time.
stage_build() {
  local gen="$1"
  rm -rf apps/web/dist.new
  mkdir -p apps/web/dist.new/assets
  echo "<html>build $gen</html>" > apps/web/dist.new/index.html
  echo "chunk $gen" > "apps/web/dist.new/assets/app-$gen.js"
  echo "shared" > apps/web/dist.new/assets/shared.js
}

echo "1. first publish onto an empty tree"
stage_build 1
publish_web_dist > /dev/null
assert_has apps/web/dist/assets app-1.js "the new build is published"
check "$([ -f apps/web/.build-assets ] && echo ok || echo no)" "the build manifest is recorded"

echo
echo "2. second publish keeps the first release's chunks"
# Age every file well past any plausible time-based prune. The previous
# implementation deleted these; nothing here may depend on mtime.
find apps/web/dist -exec touch -d '60 days ago' {} +
stage_build 2
publish_web_dist > /dev/null
assert_has apps/web/dist/assets app-2.js "this build's chunk is served"
assert_has apps/web/dist/assets app-1.js "the previous build's chunk survives, however old it is"
assert_has apps/web/dist/assets shared.js "an unchanged chunk is still there"
if [ "$(cat apps/web/dist/index.html)" = "<html>build 2</html>" ]; then
  check ok "index.html is the new one"
else
  check no "index.html is the new one" "got $(cat apps/web/dist/index.html)"
fi

echo
echo "3. third publish keeps two generations, not three"
stage_build 3
publish_web_dist > /dev/null
assert_has apps/web/dist/assets app-3.js "this build's chunk is served"
assert_has apps/web/dist/assets app-2.js "the previous build's chunk survives"
assert_lacks apps/web/dist/assets app-1.js "the release before that has fallen away"

echo
echo "4. nothing is left behind"
assert_lacks apps/web dist.new "no staging dir"
assert_lacks apps/web assets.prev "no half-swapped assets dir"

echo
printf '%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
