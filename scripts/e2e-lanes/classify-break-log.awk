# ONE OUTCOME PER PATCH, AND THE COLUMNS ADD UP BY CONSTRUCTION.
#
# This was six greps over the same file with overlapping patterns inside
# the queue runner, and it grew a column every time a category was found falling
# between the ones it had: STILL-GREEN, then UNBUILT, then MISSING, then
# NO-CHANGE, then SHORT. Each addition was right and the SHAPE was wrong — `RED`
# was whatever was left after subtracting five independently-counted sets, so
# any patch matching two of them was subtracted twice. A short run that also
# reports `0 failed` counted as still-green AND as short, which takes REDDENED
# below zero and trips "PROVED NOTHING" on a set that proved something.
#
# It lives in its own file because two programs ask this question — the runner
# and the reporter — and two copies of a classifier is the duplicated list this
# audit keeps finding.
#
# Each patch block is classified exactly once, in the order a reader would: the
# header says MISSING, FAILED or CHANGED NOTHING, else the body says the run
# stopped early, else the summary says 0 failed, else it reddened. The caller
# asserts the sum.
#
#   awk -f classify-break-log.awk /tmp/claude-0/break-<suite>.txt
#
# Set `-v names=1` to also print one line per patch with its outcome.
#
# AND `-v units=<comma-separated patch names>`, WHICH IS NOT COSMETIC.
#
# A `unit:` claim's evidence is a `*.test.ts`; `check-unit-claims.mjs` applies it
# and requires the named test to fail, every preflight. The e2e log its patch
# happens to appear in cannot speak to it either way, so `0 failed` there is
# SILENCE, not a green.
#
# `check-break-reddened.mjs` has counted them in their own column since it was
# written. This file did not, so `planner-priorities-1-two-cache-keys-again`
# showed up as `GREEN` in the report while the checker beside it called the
# same patch a unit claim — two answers to one question, in the two places a
# person reads. It cost a real investigation before it cost anything else.
function inunits(name,   n, parts, i) {
  if (units == "") return 0
  n = split(units, parts, ",")
  for (i = 1; i <= n; i++) if (parts[i] == name) return 1
  return 0
}
function flush(   name) {
  if (!inpatch) return
  name = substr(hdr, 4)
  if      (hdr ~ / MISSING/)              { missing++; verdict = "MISSING" }
  else if (hdr ~ /(BUILD|PATCH) FAILED|API DID NOT COME UP/) { unbuilt++; verdict = "UNBUILT" }
  else if (hdr ~ /PATCH CHANGED NOTHING/) { nochange++; verdict = "NOCHANGE" }
  else if (nosummary)                     { crashed++; verdict = "CRASHED" }
  else if (isshort)                       { short++; verdict = "SHORT" }
  else if (inunits(name))                 { unit++; verdict = "UNIT" }
  else if (isgreen)                       { green++; verdict = "GREEN" }
  else                                    { red++; verdict = "RED" }
  if (names) printf "%-9s %s\n", verdict, substr(hdr, 4)
  inpatch = 0
}
/^== (syncing|BASELINE|restoring|REFUSING)/ { flush(); next }
/^== / { flush(); inpatch = 1; hdr = $0; isshort = 0; isgreen = 0; nosummary = 0; next }
inpatch && /^  NO SUMMARY:/ { nosummary = 1; next }
inpatch && /^  SHORT RUN:/  { isshort = 1; next }
# AND THE OTHER WORDING FOR THE SAME FACT. Suites report a short run two ways:
# the `✗ N of M checks ran` line `wt-break.sh` tags as SHORT RUN, and
# `FAIL ran N checks, expected M`, which several suites print as an ordinary
# failure. `app-catalogue-10-frame-app-missing` stopped at 16 of 25 and was
# classified RED — a patch credited with reddening four checks, three of which
# it never reached. One partition, two spellings, and only one was being read.
inpatch && /FAIL ran [0-9]+ checks, expected/ { isshort = 1; next }
# AND "SHORT" MEANS "NOT THE SUITE'S OWN NUMBER", IN EITHER DIRECTION. The name
# is short because that is the case that keeps happening, but the same line
# catches a run that reported MORE: `space-create-menu-4-spaceinspace` came back
# `ran 29 checks, expected 28`, because a fixture derived from the file that
# patch edits gained an entry and a loop ran a tenth time. A run that did not do
# what it says is not a measurement whichever way it missed.
inpatch && /, 0 failed/     { isgreen = 1; next }
END {
  flush()
  printf "RAN=%d GREEN=%d UNBUILT=%d MISSING=%d NOCHANGE=%d SHORT=%d CRASHED=%d RED=%d UNIT=%d\n",
    missing+unbuilt+nochange+short+crashed+green+red+unit, green+0, unbuilt+0, missing+0,
    nochange+0, short+0, crashed+0, red+0, unit+0
}
