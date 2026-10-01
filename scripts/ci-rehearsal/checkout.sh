#!/bin/bash
# A fresh shallow checkout of this branch's HEAD at WORK/rundesk/rundesk, as
# actions/checkout leaves one, with its dependencies installed from this
# machine's pnpm store. Only what is committed is in it, as on the runner.
#
#   bash scripts/ci-rehearsal/checkout.sh WORK
{
set -eu
WORK=$1
REPO=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
STORE=$(cd "$REPO" && pnpm store path)
SRC="$WORK/src"
rm -rf "$SRC" "$WORK/rundesk/rundesk" "$WORK/_temp"
mkdir -p "$WORK/rundesk"
# Through a full clone, so the shallow one can be taken with --depth.
git clone -q "$REPO" "$SRC"
git clone -q --depth 1 --no-local "file://$SRC" "$WORK/rundesk/rundesk"
rm -rf "$SRC"
cd "$WORK/rundesk/rundesk"
HOME=/home/runner npm_config_store_dir="$STORE" \
  pnpm install --frozen-lockfile --offline > "$WORK/install.log" 2>&1 || { tail -20 "$WORK/install.log"; exit 1; }
echo "checkout $(git log -1 --format='%h %s' | cut -c1-80) at $WORK/rundesk/rundesk"
exit
}
