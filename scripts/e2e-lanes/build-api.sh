#!/bin/bash
# Build the API the lanes run, and record that a build happened.
#
#   build-api.sh            build only
#   build-api.sh "1 2 3"    build, then restart those lanes onto it
#
# WHY A STAMP, AND NOT JUST THE OUTPUT'S MTIME. `verify.sh` refuses to run a
# suite against an API build older than the source it was built from, because
# a lane serving a two-day-old build reported a working column as a box wired
# to nothing and the failure named the product. The first version of that check
# compared the source against the NEWEST FILE IN `dist`, and that is a check
# with a deadlock in it:
#
#   · `git checkout`, `git stash` and a break patch reverted all move a source
#     file's mtime without changing a byte;
#   · `tsc` is incremental, so a rebuild then writes NOTHING;
#   · so the newest output stays where it was, the source stays newer, and the
#     refusal repeats however many times you follow its own advice.
#
# It happened the hour the check went in. The remedy the message printed did
# not clear it, which is worse than no check: a gate you cannot satisfy gets
# switched off.
#
# The stamp answers the question the check is actually asking — "has a build
# been run since this source was last touched?" — rather than the proxy, "did
# that build write anything?". A no-op rebuild is a perfectly good answer to
# the first and no answer at all to the second.
#
# ONE BUILD, NOT TWO. `@rundesk/db` has no build script — its package `main` is
# `./src/index.ts` and the API's own `tsc -p tsconfig.build.json` compiles it
# in, which is why `apps/api/dist/packages/db/src/schema/folders.js` exists.
# The first draft of this file ran `pnpm --filter @rundesk/db build` and got
# ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT; the `-s` flag hid that the same command had
# been failing silently by hand for an hour. `verify.sh` still scans
# `packages/db/src` for staleness, and it is right to — but not because this
# build carries the schema. A lane's API runs under the tsx loader, which
# compiles `@rundesk/db` (and `@rundesk/feature-flags`) from SOURCE when the
# process starts, so a column added there reaches a lane when its API
# RESTARTS. A build with no lanes named restarts nothing; that is why
# `verify.sh` also refuses a lane whose API started before the last build.
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -u
cd /home/user/rundesk

pnpm --filter @rundesk/api build || exit 1
# AFTER the build, never before: a stamp written first would mark a build that
# then failed as done, and `verify.sh` would run against the old output with
# nothing left to say so.
mkdir -p apps/api/dist
touch apps/api/dist/.built-at
echo "api built at $(date -u +%H:%M:%S)"

LANES="${1:-}"
if [ -n "$LANES" ]; then
  bash scripts/e2e-lanes/fleet-restart.sh "$LANES"
fi
exit
}
