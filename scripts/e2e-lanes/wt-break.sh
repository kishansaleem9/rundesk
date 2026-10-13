#!/bin/bash
# Break-test a suite inside an isolated git worktree.
#
#   wt-break.sh <lane 2|3|4> <suite> <patch> [<patch> ...]
#
# Lane N uses worktree /tmp/claude-0/wtN, database rundesk_v<N> and port 302N.
# The worktree is a detached checkout with node_modules symlinked in, so three
# of these run at once without patches colliding — which is the whole reason
# break testing was stuck behind everything else.
#
# The patch scripts hardcode /home/user/rundesk, so each is rewritten into the
# worktree path before it runs. The tree the agents are working in is never
# touched.
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -u
LANE="$1"; shift
SUITE="$1"; shift
WT="/tmp/claude-0/wt$LANE"
PORT=$((3020 + LANE))
OUT="/tmp/claude-0/break-$SUITE.txt"
# NOT truncated here. It used to be, above the lock — so a run that was refused
# for interleaving destroyed the previous run's results on its way out, and a
# real 5/6 became a one-line refusal. Truncation happens after the lock is held.
#
# AND EVERY RUN IS ARCHIVED, because truncating this file is how the ledger came
# to hold six numbers nothing on disk could support. `$OUT` is one file per
# SUITE, so a later single-patch re-run — confirming one fix — erased the record
# of the full set that had run before it. Six suites showed one patch on disk
# for runs that really happened, and six rows in section 8 had to be withdrawn
# for want of evidence rather than because they were wrong.
#
# The archive copy is taken on EXIT, so a killed run leaves its partial results
# behind too. `$OUT` keeps its name and its truncate-on-start behaviour, so
# every watcher, monitor and grep that reads it is unaffected.
OUT_RUN="/tmp/claude-0/break-$SUITE-$(date +%Y%m%d-%H%M%S).txt"
# Where the tracked patches are. Derived from this script's own location so it
# is right in a clone that is not at /home/user/rundesk, unlike the paths the
# patches themselves carry (those are rewritten into the worktree below).
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="/home/user/rundesk/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx"
# Storage, in one place — see lane-env.sh for why it is not inlined here.
. "/home/user/rundesk/scripts/e2e-lanes/lane-env.sh"
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export E2E_EMAIL=admin@rundesk.internal
export E2E_PASSWORD='Admin@123!'
# Some suites stage state directly in Postgres (a column with no endpoint that
# writes it). Without this they refuse to run — correctly — and every break
# patch then "fails" for the same irrelevant reason.
export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"

# THE FAILURE SENTENCES, AND FOR HALF THE SUITES THEY WERE NEVER CAPTURED.
#
# This was `grep -E '\bFAIL\b' "$log" | sed 's/\x1b\[[0-9;]*m//g'` — strip the
# colours AFTER matching. Suites print their failures two ways:
#
#     "  FAIL  the chip says ..."                 <- matches
#     "  \x1b[31mFAIL\x1b[0m the pill read ..."   <- does NOT
#
# `\b` is a word boundary, and `m` is a word character, so `mFAIL` has none
# before the F. Every suite that colours the word itself had its FAIL lines
# silently dropped: `focus-pill`'s `fp-1-set-once` reddened eleven checks and
# the log recorded the patch name, no sentences, and `4 passed, 11 failed`.
#
# The count went with them. `NFAIL` was 0, so "… and N more FAIL lines not
# shown" could not fire either — the one line that would have said something
# was missing.
#
# What that costs is the whole point of the log. The summary says HOW MANY
# checks reddened; only the sentences say WHICH, and a patch is only evidence
# if the checks it reddened are the ones it claims. The numbers in the ledger
# were right and unverifiable.
#
# So the colours come off FIRST and `\bFAIL\b` then does what it was added for:
# excluding the `FAILURES` banner suites print above their summary, which a
# bare `FAIL` matched and counted as one more failure than there were.
fail_lines() {
  sed 's/\x1b\[[0-9;]*m//g' "$1" | grep -E '\bFAIL\b'
}

restart() {
  # KILL BY PORT, NOT BY ENV VAR.
  #
  # This was `pkill -f "PORTMARK=$LANE "`, and `pkill -f` matches the COMMAND
  # LINE while `PORTMARK` is an environment variable — so it never matched
  # anything. The old, unpatched API kept the port, the new one failed to bind,
  # and every API-side break patch reported its suite still passing. Web
  # patches reddened because the browser reads a freshly built bundle; API
  # patches did not, because the server under test was never replaced. The
  # pattern in the results is what gave it away.
  local pids
  pids=$(lsof -t -i ":$PORT" -sTCP:LISTEN 2>/dev/null | sort -u)
  [ -n "$pids" ] && kill $pids 2>/dev/null
  for i in $(seq 1 20); do
    curl -s --noproxy '*' -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/api/v1/health" || break
    sleep 1
  done
  if curl -s --noproxy '*' -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/api/v1/health"; then
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
    sleep 2
  fi
  # The store has to BE up, not merely be pointed at. `lane_store_up` keeps a
  # running one and its objects — a restart that emptied the bucket would make
  # a suite's second run differ from its first for a reason nothing in the
  # suite mentions.
  lane_store_up "$LANE"
  lane_model_up "$LANE"
  lane_search_up "$LANE"
  lane_calendar_up "$LANE"
  lane_media_up "$LANE"
  lane_mail_up "$LANE"
  (
    cd "$WT/apps/api"
    export PORT="$PORT" PORTMARK="$LANE"
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
    export JWT_ACCESS_SECRET=ci-access-secret-min-32-chars-aaaaaaaaaaaa
    export JWT_REFRESH_SECRET=ci-refresh-secret-min-32-chars-bbbbbbbbbb
    # Storage, from the one place that defines it — see lane-env.sh. Without
    # this the lane comes up with R2 unconfigured and every upload check
    # measures the refusal path instead of the real one.
    lane_store_env "$LANE"
    lane_model_env "$LANE"
    lane_search_env "$LANE"
    lane_calendar_env "$LANE"
    lane_media_env "$LANE"
    lane_mail_env "$LANE"
    lane_oauth_env "$LANE"
    lane_proxy_env "$LANE"
    nohup node --require "$TSX/dist/preflight.cjs" \
      --import "file://$TSX/dist/loader.mjs" \
      dist/apps/api/src/main.js > "/tmp/claude-0/api-v$LANE.log" 2>&1 &
  )
  # Up is health AND, where the set needs the index, an API searching through
  # its stub (`lane_search_ready`): one whose init failed would measure every
  # patch on the Postgres path and read as reddening nothing.
  for i in $(seq 1 40); do
    curl -s --noproxy '*' -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/v1/health" && { lane_search_ready "$LANE"; return; }
    sleep 2
  done
  return 1
}

cd "$WT" || exit 1
# A lock, because two runs sharing one worktree check out, patch and build over
# each other and every result is then about whichever run wrote last. That
# happened once and produced a set of "passes" that meant nothing.
#
# SIGNED WITH THIS PROCESS'S PID (`lock_take`, lane-env.sh), because the EXIT
# trap below is skipped by SIGKILL and a reaped run left a bare directory that
# held the lane for ever. A lock whose holder is gone is now taken, and said.
#
# AND THE SUITE, because `$OUT` is one file per suite: a second set of the same
# suite on another lane truncated this one's results mid-run
# (`break_locks_take`, lane-env.sh, says why and which lock refused).
break_locks_take "$LANE" "$SUITE" || exit 3
trap 'cp "$OUT" "$OUT_RUN" 2>/dev/null; break_locks_drop "$LANE" "$SUITE"' EXIT
# Only now that the lane is ours. A refusal must not touch the results of the
# run that legitimately holds it.
: > "$OUT"

# A SET WITH A PATCH ONLY A MODEL CAN REDDEN RUNS WITH ONE, baseline and all
# (`patches_needing_model`, lane-env.sh). Said in the log, on a line that is
# not a `== ` header, so every reader of these logs passes over it.
NEEDS_MODEL=$(patches_needing_model "$REPO/test/e2e/breaks" "$@" | tr '\n' ' ' | sed 's/ *$//')
NEEDS_NO_MODEL=$(patches_needing_no_model "$REPO/test/e2e/breaks" "$@" | tr '\n' ' ' | sed 's/ *$//')
# One lane is either answered by a model or not: a set wanting both is two sets
# (`build-plan.sh` writes them so), and run as one it measures half of itself.
if [ -n "$NEEDS_MODEL" ] && [ -n "$NEEDS_NO_MODEL" ]; then
  echo "== REFUSING — $NEEDS_MODEL need a model and $NEEDS_NO_MODEL need none: run them as two sets" >> "$OUT"
  exit 4
fi
[ -n "$NEEDS_MODEL" ] && lane_model_add "$LANE"
[ -n "$NEEDS_NO_MODEL" ] && lane_model_remove "$LANE"
# AND A SET WITH A PATCH ONLY THE INDEX CAN REDDEN RUNS WITH A SEARCH STUB,
# baseline and all (`patches_needing_search`, lane-env.sh): the indexers write
# to nothing a lane without one can read.
NEEDS_SEARCH=$(patches_needing_search "$REPO/test/e2e/breaks" "$@" | tr '\n' ' ' | sed 's/ *$//')
[ -n "$NEEDS_SEARCH" ] && lane_search_add "$LANE"
# AND THE SUITE'S OWN NEED (`suite_lane_need`, lane-env.sh): one that stands on
# the assistant's refusal runs without a model, and one that stages the stub
# with one. A set whose patches need a model its suite refuses cannot be
# measured, and is refused rather than run.
SUITE_NEED=$(suite_lane_need "$REPO/test/e2e/$SUITE.mjs")
if [ "$SUITE_NEED" = "no-model" ]; then
  if [ -n "$NEEDS_MODEL" ]; then
    echo "== REFUSING — $SUITE runs without a model (its header), and $NEEDS_MODEL need one" >> "$OUT"
    exit 4
  fi
  lane_model_remove "$LANE"
elif [ "$SUITE_NEED" = "model" ]; then
  lane_model_add "$LANE"
fi

# ── AND THE WORKTREE HAS TO RESOLVE ITS OWN WORKSPACE PACKAGES. ───────────
#
# A PATCH TO `packages/**` WAS APPLIED IN THE WORKTREE AND BUILT FROM THE REPO.
#
# These worktrees borrow node_modules with an absolute symlink —
# `wt3/apps/web/node_modules -> /home/user/rundesk/apps/web/node_modules` — and
# pnpm links workspace packages RELATIVELY inside it:
# `@rundesk/ui -> ../../../../packages/ui`. Four levels up from the repo's
# directory is the repo, so `@rundesk/ui` resolved to
# `/home/user/rundesk/packages/ui` no matter which tree was building.
#
# So a patch editing `packages/ui/src/styles.css` applied cleanly, showed up in
# `git diff` (which is what makes this rebuild the bundle at all), triggered the
# rebuild — and the bundle came out byte-identical, because vite read the
# unpatched file through the symlink. `PATCH CHANGED NOTHING` cannot catch it:
# the patch really did change the worktree.
#
# `sd-1-contrast-marks-but-does-not-paint` ran GREEN this way, and
# `folder-create-12-toast-bottom-right` was recorded as reddening three checks
# that have nothing to do with its claim. Four patches in the repository touch
# `packages/**`; two of them go through this path, and both were inert.
#
# Fixed by giving each worktree its own tiny node_modules: a real directory of
# symlinks to the repo's entries — 27 for web, 33 for api, 4 at the root, since
# pnpm keeps only direct dependencies there — with `@rundesk/*` pointed at THIS
# tree's packages. Idempotent, and re-done on every sync so a package added
# upstream cannot go missing.
link_own_packages() {
  # Every workspace directory that has dependencies of its own. `packages/ui`
  # is the one that made this list explicit: it imports `sonner`, and with the
  # build finally reading the WORKTREE's copy, node walked up from
  # `$WT/packages/ui/` and found no `node_modules` at all — so the fix for one
  # resolution bug produced a build failure, which is the honest version of the
  # same problem and took ten seconds to read.
  for dir in . apps/web apps/api packages/ui packages/db packages/feature-flags packages/eslint-config; do
    src="$REPO/$dir/node_modules"
    dst="$WT/$dir/node_modules"
    [ -d "$src" ] || continue
    # A symlink is borrowed and gets replaced; nothing there at all gets built.
    # A REAL directory was installed on purpose and is left alone.
    if [ -e "$dst" ] && [ ! -L "$dst" ]; then
      # Already ours from a previous run — refresh `@rundesk` and move on.
      :
    elif [ -L "$dst" ]; then
      rm -f "$dst"
    fi
    mkdir -p "$dst"
    # `ls -A`, not a glob: `.bin` and `.pnpm` are dotted, and a glob silently
    # drops them. Leaving `.bin` out breaks every package that shells out.
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
}

# ── THE WORKTREE HAS TO BE AT HEAD, AND THE SUITE HAS TO BE GREEN WITHOUT A
#    PATCH, OR EVERYTHING BELOW IS UNREADABLE. ──────────────────────────────
#
# This cost a whole suite's evidence before it was written. The worktrees are
# DETACHED checkouts made once and never moved, so they drift behind the branch
# as agents land work. `list-card-cover` was run here against a tree two commits
# old: four of its checks failed on EVERY patch, including patches that touch
# nothing near them, and the same four failed on the unpatched tree. With four
# checks already red you cannot tell what any patch reddened — the whole run
# says nothing, and it says it in the shape of a result.
#
# Two guards, because they catch different things. Syncing to HEAD fixes drift.
# The baseline catches everything else drift is not: a suite that is genuinely
# red right now, a lane whose database is behind, a fixture another run left
# lying around. A patch that reddens a check which was ALREADY red is not
# evidence, and the baseline line at the top of the file is what lets the next
# reader see that at a glance instead of inferring it from a pattern.
REV=$(git -C /home/user/rundesk rev-parse HEAD)
# THE COMMIT IS RECORDED WHETHER OR NOT ANYTHING HAD TO MOVE.
#
# This line used to live INSIDE the `if` below, so a set that started with its
# worktree already at HEAD — which happens whenever two sets run back to back
# without a commit between them — wrote no provenance at all.
# `integration-error-card` came back 8 of 8 reddened and UNPLACEABLE: every
# reader of these logs dates a run by this line, so a log without one is a
# measurement of no particular tree.
#
# Worse than a gap in the record: those sets could never be brought current.
# `--drifted` puts an unplaceable log back in the work list, the re-run has the
# same chance of finding the worktree already synced, and the chain would stop
# on "no progress" against sets that were running perfectly.
echo "== syncing $WT to $(echo "$REV" | cut -c1-8)" >> "$OUT"
echo "-- model: $(lane_has_model "$LANE" && echo on || echo off)${NEEDS_MODEL:+ — needed by $NEEDS_MODEL}" >> "$OUT"
echo "-- search: $(lane_has_search "$LANE" && echo on || echo off)${NEEDS_SEARCH:+ — needed by $NEEDS_SEARCH}" >> "$OUT"
# WHAT THE LANE IS SERVING, NOT WHAT THE WORKTREE HOLDS. The sync used to run
# only when the worktree's checkout differed from HEAD, and assumed the API
# serving the lane had been built from it. A run killed between the checkout
# and the restart (stopping plan-4 did exactly that on lane 3), or during a
# patch, left the checkout at HEAD and the lane serving an older or a PATCHED
# binary; every later run skipped the sync and measured that binary. The next
# baseline on lane 3 failed 4 of 7 against code that had been fixed. This stamp
# is written only once an unpatched build of REV is up, and cleared before any
# patched restart, so a missing or different stamp forces the sync.
STAMP="/tmp/claude-0/wt$LANE.serving"
# And whether it was started with a model (`lane_serving_id`): the same binary
# with and without one answers the AI's routes differently.
SERVING="$(lane_serving_id "$REV" "$LANE")"
if [ "$(git -C "$WT" rev-parse HEAD)" != "$REV" ] || [ "$(cat "$STAMP" 2>/dev/null)" != "$SERVING" ]; then
  rm -f "$STAMP"
  git -C "$WT" checkout -- . 2>/dev/null
  if ! git -C "$WT" checkout --detach "$REV" > /dev/null 2>&1; then
    echo "== CANNOT SYNC WORKTREE — refusing to run, results would be about the wrong tree" >> "$OUT"
    exit 4
  fi
  link_own_packages
  # THE SCHEMA PUSH IS CHECKED like the builds below. Unchecked, a push that
  # failed left the lane's database on an older schema while the baseline and
  # every patch ran against it (`harness/wt-break-unchecked-restart-and-restore`).
  if ! ( cd "$WT/packages/db"
    export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
    yes | pnpm exec drizzle-kit push --force > "/tmp/claude-0/wt$LANE-push.log" 2>&1 ); then
    { echo "== SCHEMA PUSH FAILED for rundesk_v$LANE — refusing, the baseline would measure an older schema"
      tail -5 "/tmp/claude-0/wt$LANE-push.log"; } >> "$OUT"
    exit 4
  fi
  # CHECKED, because an unchecked build is a silent one. This ran without `||`
  # and a build killed part-way — by a stray `pkill vite`, as it happens — left
  # the worktree with no `dist` at all. The next run then died inside the suite
  # on `ENOENT …/wtN/apps/web/dist/index.html`, which reads as a broken suite
  # rather than as a build that never finished. Say which it was.
  if ! pnpm -C apps/api exec tsc -p tsconfig.build.json > "/tmp/claude-0/wt$LANE-api.log" 2>&1; then
    { echo "== API BUILD FAILED in $WT — refusing, the lane would serve a stale binary"
      tail -5 "/tmp/claude-0/wt$LANE-api.log"; } >> "$OUT"
    exit 4
  fi
  if ! pnpm -C apps/web exec vite build > "/tmp/claude-0/wt$LANE-web.log" 2>&1; then
    { echo "== WEB BUILD FAILED in $WT — refusing, there would be no bundle to measure"
      tail -5 "/tmp/claude-0/wt$LANE-web.log"; } >> "$OUT"
    exit 4
  fi
  if ! restart; then
    echo "== THE API DID NOT COME UP on $PORT after the sync — refusing, the baseline would measure nothing" >> "$OUT"
    exit 4
  fi
  echo "$SERVING" > "$STAMP"
fi

# A worktree that was never built, or whose build was interrupted before this
# guard existed, has no bundle and nothing above would have noticed: the sync
# block only runs when the revision differs. Build it once, here, so the
# baseline below measures a page rather than an ENOENT.
if [ ! -f "$WT/apps/web/dist/index.html" ]; then
  echo "== $WT has no bundle — building it before the baseline" >> "$OUT"
  if ! pnpm -C apps/web exec vite build > "/tmp/claude-0/wt$LANE-web.log" 2>&1; then
    { echo "== WEB BUILD FAILED in $WT"; tail -5 "/tmp/claude-0/wt$LANE-web.log"; } >> "$OUT"
    exit 4
  fi
fi

# Also here, not only under the sync: a worktree already at HEAD skips the block
# above entirely, and that is exactly the state the borrowed symlink survived in.
link_own_packages
# AND THE BASELINE IS MEASURED AGAINST A BUNDLE BUILT FROM THESE SOURCES.
#
# Belt and braces with the rebuild in the restore block at the bottom: that one
# runs at the END of a set, so it is missed by any run that was killed, refused
# or crashed — and this is the first thing that reads `dist`. Unconditional and
# cheap next to a suite run.
pnpm -C apps/web exec vite build > "/tmp/claude-0/wt$LANE-web.log" 2>&1 || {
  { echo "== WEB BUILD FAILED in $WT before the baseline — refusing"
    tail -5 "/tmp/claude-0/wt$LANE-web.log"; } >> "$OUT"
  exit 4
}
# In a UTF-8 locale, as verify.sh runs a suite (`LANE_SUITE_LOCALE`, lane-env.sh).
timeout 900 env "${LANE_SUITE_LOCALE[@]}" node "$WT/test/e2e/$SUITE.mjs" --api "$PORT" --dist "$WT/apps/web/dist" \
  > "/tmp/claude-0/brk-$SUITE-baseline.log" 2>&1
BASE=$(grep -E 'passed,' "/tmp/claude-0/brk-$SUITE-baseline.log" | tail -1 | sed 's/\x1b\[[0-9;]*m//g')
echo "== BASELINE (no patch) $BASE" >> "$OUT"
# AN UNREADABLE BASELINE IS NOT A RED ONE, and saying so is the difference
# between fixing a suite and fixing a print statement.
#
# `checklists` printed `14/14 passed` where every other suite prints
# `N passed, M failed`, so this grep found nothing, `$BASE` was empty, and the
# refusal below announced "the unpatched suite is not green" about a suite
# passing fourteen of fourteen. It had never been break-testable and the
# message pointed at the wrong thing every single time.
if [ -z "$BASE" ]; then
  { echo "== REFUSING TO BREAK-TEST — the baseline run printed NO summary line this harness"
    echo "   can read. That is not the same as the suite being red: it may have crashed, timed"
    echo "   out, or printed its total in a form other than 'N passed, M failed'. Look at"
    echo "   /tmp/claude-0/brk-$SUITE-baseline.log before changing any product code."
    tail -3 "/tmp/claude-0/brk-$SUITE-baseline.log" | sed 's/\x1b\[[0-9;]*m//g'
  } >> "$OUT"
  exit 5
fi
case "$BASE" in
  *' 0 failed'*) ;;
  *)
    { echo "== REFUSING TO BREAK-TEST — the unpatched suite is not green, so no patch below"
      echo "   could be told apart from what is already broken. Fix the baseline first."
      fail_lines "/tmp/claude-0/brk-$SUITE-baseline.log" | head -6
    } >> "$OUT"
    exit 5
  ;;
esac
# "0 FAILED IS NOT IT RAN" — AND THIS HARNESS WAS THE ONE PLACE THAT STILL
# BELIEVED IT.
#
# Every suite carries an `EXPECTED_CHECKS` constant compared with `!==`, and
# prints `✗ N of M checks ran` and exits 1 when a run stopped early. The line
# matches neither `FAIL` nor `passed,`, so nothing here has ever read it: a
# baseline that took a short branch, reported `84 passed, 0 failed` and exited
# 1 would be accepted as green, and every patch measured against it compared
# against a run four checks shorter than the suite.
SHORT_LINE=$(grep -E 'checks ran' "/tmp/claude-0/brk-$SUITE-baseline.log" | tail -1 | sed 's/\x1b\[[0-9;]*m//g')
if [ -n "$SHORT_LINE" ]; then
  { echo "== REFUSING TO BREAK-TEST — the baseline run was SHORT, so the summary above"
    echo "   describes only the part it reached. A patch measured against it cannot be"
    echo "   told from a patch that shortened it further."
    echo "  $SHORT_LINE"
  } >> "$OUT"
  exit 5
fi

# Was the PREVIOUS patch a web one? If so its bundle is still on disk, and an
# API-only patch that follows would run against it — so every later check would
# be measuring the last web patch's breakage rather than its own.
#
# AND THE SAME IN THE OTHER DIRECTION, which was missing for a long time. There
# was a `WEB_DIRTY` and no `API_DIRTY`: after an API patch, `apps/api/dist`
# holds the patched build and the lane is serving it, so the next web-only
# patch sets `NEEDS_API=no`, skips the rebuild AND the restart, and runs its
# checks against the previous patch's broken server. Found by the field-types
# run, where patch 18 was an API one and every web patch after it — fourteen
# of them — measured patch 18. The symptom is a block of patches that all
# redden the same unrelated check, which reads like a real finding.
WEB_DIRTY=no
API_DIRTY=no
for b in "$@"; do
  # NAME OR PATH, both accepted.
  #
  # This used to take only the bare name, and a caller who passed the path it
  # had just written — which tab-completes, and which every other script in
  # this directory takes — got eight lines of "MISSING" for eight files that
  # were sitting right there. A whole break set reported as absent because the
  # argument was spelled the obvious way is the stale-reason defect wearing a
  # shell script: the message named a real condition and meant something else.
  b=$(patch_stem "$b")
  # THIS ATTEMPT'S LOG OR NONE. It was only written when the patch got as far as
  # running the suite, so a patch that was missing, failed to apply, changed
  # nothing or did not build left the PREVIOUS run's log in place — and the
  # reddened checker read it as this run's, dated by this run's commit.
  rm -f "/tmp/claude-0/brk-$b.log"
  # THE REPOSITORY IS THE SOURCE, AND THIS LINE WAS THE LAST PLACE THAT STILL
  # DISAGREED.
  #
  # `/tmp/claude-0/breaks` is where these lived before they were committed.
  # `check-break-patches.py` moved to the tracked copy and says why in its own
  # comment — "the repository is what CI has and what survives the container" —
  # and this script was never brought along, so it kept reading the staging
  # directory. Every patch written straight into `test/e2e/breaks` and never
  # hand-copied across came back MISSING, which is what happened to twelve of
  # them in a row: four suites' worth of patches, none of which ran.
  #
  # The fallback stays so an older staged patch is still reachable, but the
  # tracked file wins whenever there is one. A patch edited in the repository
  # and stale in `/tmp` would otherwise run the stale copy and report on it
  # under the new name — the two directories were byte-identical when this was
  # written, so nothing already recorded describes the wrong patch, but only
  # because nobody had yet edited one in place.
  SRC="$REPO/test/e2e/breaks/$b.py"
  [ -f "$SRC" ] || SRC="/tmp/claude-0/breaks/$b.py"
  [ -f "$SRC" ] || { echo "== $b MISSING (not in $REPO/test/e2e/breaks nor /tmp/claude-0/breaks)" >> "$OUT"; continue; }
  P="/tmp/claude-0/wt$LANE-patch.py"
  sed "s#/home/user/rundesk#$WT#g" "$SRC" > "$P"

  git -C "$WT" checkout -- . 2>/dev/null
  if ! python3 "$P" > /dev/null 2>/tmp/claude-0/wt$LANE-pf.err; then
    { echo "== $b PATCH FAILED"; tail -2 "/tmp/claude-0/wt$LANE-pf.err"; } >> "$OUT"
    continue
  fi

  CHANGED=$(git -C "$WT" diff --name-only)
  NEEDS_API=no; NEEDS_WEB=no
  # WHICH SIDE CONSUMES THE CHANGED PACKAGE, not just "it is a package".
  # `packages/*` all went to the API rebuild, so a patch to `packages/ui` —
  # which only the WEB bundle consumes — rebuilt the server and left the
  # bundle untouched. Its check stayed green with the component broken.
  case "$CHANGED" in *apps/api/*|*packages/db/*) NEEDS_API=yes ;; esac
  case "$CHANGED" in *apps/web/*|*packages/ui/*|*packages/feature-flags/*) NEEDS_WEB=yes ;; esac
  # `packages/db` is read by the web typecheck too, and `feature-flags` by both.
  case "$CHANGED" in *packages/feature-flags/*) NEEDS_API=yes ;; esac
  [ -z "$CHANGED" ] && { echo "== $b PATCH CHANGED NOTHING" >> "$OUT"; continue; }

  OK=yes
  # A SCHEMA PATCH HAS TO REACH THE DATABASE, or it proves nothing. Dropping an
  # index from `packages/db/src/schema` and rebuilding leaves the index sitting
  # in the lane's Postgres, so "the index refuses a direct insert" stayed green
  # with the index deleted from the source. The schema is pushed whenever
  # packages/** changed, which is also how a real deployment gets it.
  case "$CHANGED" in *packages/db/*)
    ( cd packages/db
      export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
      yes | pnpm exec drizzle-kit push --force > "/tmp/claude-0/wt$LANE-push.log" 2>&1 ) || OK=no
  ;; esac
  # Rebuild the API when this patch touches it, AND when the previous one did —
  # the mirror of the bundle rule below, and for the same reason.
  if [ "$NEEDS_API" = yes ] || [ "$API_DIRTY" = yes ]; then
    pnpm -C apps/api exec tsc -p tsconfig.build.json > "/tmp/claude-0/wt$LANE-api.log" 2>&1 || OK=no
  fi
  # Rebuild the bundle when this patch touches web, AND when the previous one
  # did — otherwise this patch runs against the previous patch's breakage.
  if [ "$NEEDS_WEB" = yes ] || [ "$WEB_DIRTY" = yes ]; then
    pnpm -C apps/web exec vite build > "/tmp/claude-0/wt$LANE-web.log" 2>&1 || OK=no
  fi
  WEB_DIRTY="$NEEDS_WEB"

  if [ "$OK" = yes ]; then
    # Restart when this patch touched the API, or when the previous one did and
    # the lane is therefore still serving that patch's binary.
    #
    # AND THE RESTART IS CHECKED. Its answer was ignored here, so a lane that did
    # not come back (Postgres out of clients, say) ran the suite against a dead
    # port: every check failed, and the reddened checker credited the claim.
    # A patch whose API never came up is not measured, and says so in a line the
    # log readers count as not run (`NOT_RUN`, `classify-break-log.awk`). The
    # lane is left dirty, so the next patch rebuilds and restarts it.
    if [ "$NEEDS_API" = yes ] || [ "$API_DIRTY" = yes ]; then
      rm -f "$STAMP"
      if ! restart; then
        echo "== $b API DID NOT COME UP on $PORT — not measured" >> "$OUT"
        API_DIRTY=yes
        continue
      fi
    fi
    API_DIRTY="$NEEDS_API"
    timeout 900 env "${LANE_SUITE_LOCALE[@]}" node "$WT/test/e2e/$SUITE.mjs" --api "$PORT" --dist "$WT/apps/web/dist" \
      > "/tmp/claude-0/brk-$b.log" 2>&1
    # WHAT THIS FILE RECORDS IS THE ONLY THING ANYBODY READS, and it was
    # under-reporting in two ways that both look like a clean result.
    #
    #  - `head -4` silently truncated the list. A patch reddening seven checks
    #    was recorded as reddening four, and the prediction-vs-actual counts in
    #    every patch header are read off this file. The cap stays — an OUT file
    #    with ninety FAIL lines in it is not read by anyone — but it now says
    #    how many it withheld, so a truncated list cannot be mistaken for a
    #    complete one.
    #  - `grep -E 'FAIL'` also matched the `FAILURES` banner suites print above
    #    their summary, so the count was one too many. `\bFAIL\b` does not.
    #  - THE SHORT-RUN LINE WAS NEVER CAPTURED AT ALL. `vr-4` took a branch of
    #    `video-regression`'s G13-10 block that reports three checks where the
    #    other branch reports seven; the suite printed `✗ 88 of 92 checks ran`
    #    and exited 1, and this file recorded `84 passed, 4 failed` with
    #    nothing to say four checks never happened. `break-queue.sh` (the
    #    reader then, since deleted) counted it as a clean reddening, which is
    #    exactly the shape this whole audit
    #    calls the confident zero.
    #  - AND A RUN THAT CRASHED PRINTED NO SUMMARY AT ALL, which was recorded as
    #    a patch line with some FAIL lines under it and nothing else — the exact
    #    shape of a patch that reddened. `emoji-picker-2-data-inlined` makes the
    #    picker load successfully, so the suite's failure-state section finds no
    #    Try again button, and an unguarded `locator.click()` threw an uncaught
    #    TimeoutError that killed the process before the totals were printed.
    #    A crash is not a proof: the checks after the throw did not run, and the
    #    ones before it were measured against a process that then died. Named
    #    here so the readers of these logs count it as its own outcome —
    #    `classify-break-log.awk` as CRASHED (for `break-report.sh`), and
    #    `check-break-reddened.mjs` as a run that died before its totals.
    NFAIL=$(fail_lines "/tmp/claude-0/brk-$b.log" | wc -l)
    SUMMARY=$(grep -E 'passed,' "/tmp/claude-0/brk-$b.log" | tail -1 | sed 's/\x1b\[[0-9;]*m//g')
    { echo "== $b"
      fail_lines "/tmp/claude-0/brk-$b.log" | head -12
      [ "$NFAIL" -gt 12 ] && echo "  … and $((NFAIL - 12)) more FAIL lines not shown"
      if [ -n "$SUMMARY" ]; then
        echo "$SUMMARY"
      else
        echo "  NO SUMMARY: the run printed no 'N passed, M failed' line — it died before the totals"
        tail -4 "/tmp/claude-0/brk-$b.log" | sed 's/\x1b\[[0-9;]*m//g' | sed 's/^/    /'
      fi
      grep -E 'checks ran' "/tmp/claude-0/brk-$b.log" | tail -1 | sed 's/\x1b\[[0-9;]*m//g' \
        | sed 's/^/  SHORT RUN: /'
    } >> "$OUT"
  else
    { echo "== $b BUILD FAILED"; tail -3 "/tmp/claude-0/wt$LANE-api.log" "/tmp/claude-0/wt$LANE-web.log" 2>/dev/null; } >> "$OUT"
  fi
done

git -C "$WT" checkout -- . 2>/dev/null
echo "== restoring $WT" >> "$OUT"
# The lane's database may be carrying a patched schema; put it back.
#
# EACH RESTORE STEP IS CHECKED. Unchecked, a push or a build that died left the
# lane on the last patch's schema or binary, and the next set at the same sha
# skipped the sync block. The stamp is not written unless all of it worked, so
# the next run syncs; and a failed restore says so and exits 4, as a failed sync
# does, rather than printing DONE.
RESTORED=yes
( cd "$WT/packages/db"
  export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/rundesk_v$LANE"
  yes | pnpm exec drizzle-kit push --force > "/tmp/claude-0/wt$LANE-push.log" 2>&1 ) || {
  echo "== RESTORE FAILED: the schema push for rundesk_v$LANE" >> "$OUT"; RESTORED=no; }
pnpm -C apps/api exec tsc -p tsconfig.build.json > "/tmp/claude-0/wt$LANE-api.log" 2>&1 || {
  echo "== RESTORE FAILED: the API build in $WT" >> "$OUT"; RESTORED=no; }
# AND THE BUNDLE, WHICH `git checkout -- .` DOES NOT TOUCH.
#
# `dist/` is not tracked, so restoring the sources leaves the last patch's
# BUNDLE on disk — and the last patch in a set is usually a web one. The next
# run's baseline is measured against whatever bundle is there, so lane N could
# open suite B against a bundle still carrying suite A's final patch. A patch
# for one suite rarely reddens another, which is exactly what makes it silent:
# the baseline comes back green and every result in the run is about a tree
# nobody described.
# Once: it ran twice here, an extra build per set (`harness/wt-break-double-vite-build`).
pnpm -C apps/web exec vite build > "/tmp/claude-0/wt$LANE-web.log" 2>&1 || {
  echo "== RESTORE FAILED: the web build in $WT" >> "$OUT"; RESTORED=no; }
if [ "$RESTORED" = yes ] && restart; then
  echo "$SERVING" > "$STAMP"
else
  [ "$RESTORED" = yes ] && echo "== RESTORE FAILED: the API did not come up on $PORT" >> "$OUT"
  echo "== the lane is not restored; the next run on it syncs first" >> "$OUT"
  exit 4
fi
echo "DONE $SUITE" >> "$OUT"
exit
}
