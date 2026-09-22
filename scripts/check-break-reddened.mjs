#!/usr/bin/env node
/*
 * DID THE PATCH REDDEN THE CHECK IT CLAIMS? Measured, not read.
 *
 * `check-break-claims.mjs` asks whether the sentence a patch quotes EXISTS in
 * its suite, and `check-break-coverage.mjs` says in its own header that it
 * counts AIM rather than proof. Between them a patch can be written,
 * attributed, claim-verified and reported as closing a suite while reddening
 * something else entirely — or nothing. The ledger's §8 was the only place that
 * gap was closed, by hand, one patch at a time.
 *
 * The evidence was on disk the whole time. `wt-break.sh` writes
 * `/tmp/claude-0/brk-<patch>.log` for every patch it runs, and 782 of them
 * survive. What was missing was anybody comparing the `# Reddens:` block
 * against the run.
 *
 * HOW A CHECK'S OUTCOME IS READ, and it is the PASS lines that carry it. Most
 * suites print `PASS <the check's sentence>` and, on failure, `FAIL <the
 * reason>` — `chk = (cond, good, bad) => … ${bad ?? good}` — so a failing check
 * often does not name itself at all. Seventy suites are written that way. The
 * sentence therefore appears among the PASSES exactly when the check passed,
 * which is the inference this file rests on:
 *
 *   REDDENED   the claim appears in a FAIL line (direct evidence), or appears
 *              in no PASS line while the run reported failures (inferred).
 *   STILL GREEN the run reported `0 failed`. Nothing was disproved, whatever
 *              the sentences say.
 *   UNPROVEN   the run reported failures AND every claimed sentence is also
 *              among the passes, so this cannot say whether the claimed check
 *              is one of the ones that failed.
 *   UNKNOWN    no run log on this machine, or a log with no totals in it.
 *
 * UNPROVEN HAS TWO CAUSES AND THIS DOES NOT GUESS BETWEEN THEM. Either the
 * patch really reddened other checks — a misattribution worth acting on — or
 * the claim is a fragment of a TEMPLATE sentence that several iterations of a
 * loop print, and the iteration that failed printed its reason instead of its
 * name. `us-1-grouped-column-still-shown` is the second kind: its header says
 * "the `status` iteration of" and the priority and assignee iterations pass
 * with the same fragment. Making the 70 suites print `FAIL <sentence> —
 * <reason>` would move most of these into REDDENED, which is the fix rather
 * than a looser rule here.
 *
 * LOCAL CHECK, PREFLIGHT ONLY. Its evidence is under /tmp on the machine that
 * did the running, so in CI it would find nothing and exit 0 — a check that
 * cannot fail dressed as a passing one, which is the reason
 * `check-break-freshness.mjs` is not in CI either.
 *
 * A `unit:` CLAIM IS NOT JUDGED HERE AT ALL. Its evidence is a `*.test.ts`, and
 * the e2e log its patch happens to appear in cannot speak to it either way — so
 * counting a green from one as "a patch that disproves no check" is the same
 * mistake as counting a short run as a reddening. Reported as its own count.
 *
 * Three ratchets: a floor on what is measured, ceilings on the two kinds of
 * silence.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { norm, quotedIn } from './lib/claim-match.mjs'
import { reddensText, makeSuiteOf, declaresShortRun } from './lib/suite-of-patch.mjs'
import { measuredAt, patchDeps, makeMeasurementCheck } from './lib/log-tree.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BREAKS = join(ROOT, 'test/e2e/breaks')
const SUITES = join(ROOT, 'test/e2e')
const LOGS = '/tmp/claude-0'

const suiteNames = readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4))
const suiteOf = makeSuiteOf({ suiteDir: SUITES, candidates: suiteNames })
const expectedIn = {}
for (const n of suiteNames) {
  expectedIn[n] = Number(
    readFileSync(join(SUITES, `${n}.mjs`), 'utf8').match(/^const EXPECTED_CHECKS = (\d+)/m)?.[1] ?? 0,
  )
}

/*
 * Measured 22 September over 782 surviving run logs.
 *
 * `reddened` IS A FLOOR AND THE OTHER TWO ARE CEILINGS, which is the direction
 * each number can honestly move: as sets get measured, reddened rises and the
 * unusable-log count falls. The floor is what catches a regression that makes
 * the logs unreadable — with the escape-strip removed, reddened fell from 620
 * to 51 and BOTH ceilings went to zero, so a ceiling-only ratchet would have
 * called that an improvement.
 *
 * Lowering the floor is legitimate only when the MEASUREMENT changed and the
 * new number is the true one — and then it is said out loud, here, with what
 * changed. It has happened once:
 *
 * **620 → 501, and the 620 was wrong.** The first version compared a claim
 * against any log it found, and 119 of those logs were not complete runs of the
 * suite the patch names: `ai-answer-rendering` declares 51 checks and its logs
 * hold 30, 29, 26 and 12, while `v1a-2-announce-notifies-the-actor` aims at
 * `notification-gaps` and had been exercised inside the `video1-acceptance`
 * set. Each of those was counted as a measurement. 501 is what is actually
 * measured; the difference moved to the unusable-log pile, where it can be
 * worked off by running the sets.
 *
 * **501 → 514, and the 501 was matching too loosely.** Claims were compared to
 * the log's lines with `findsClaim`, whose five-word fragment fallback let a
 * claim match a NEIGHBOURING check's passing sentence. Whole-claim matching is
 * the right rule for "did this check pass" and moved thirteen patches into the
 * column the logs plainly put them in.
 *
 * THE FLOOR SITS BELOW THE CHURN. `wt-break.sh` truncates `brk-<patch>.log` at
 * the start of each patch run, so while a sweep is in flight the live count
 * dips by however many logs are mid-rewrite — 513 one minute and 514 the next,
 * with nothing wrong. 500 is under that and still catches the failure this
 * floor exists for: the escape-strip regression took the count to 51.
 */
/*
 * `green` is 1 rather than 2 since the `unit:` claims stopped being counted as
 * patches that disproved nothing — their evidence is a `*.test.ts` and an e2e
 * log cannot speak to it either way.
 *
 * TIGHTENED AS THE WORK LANDED, which is the only direction a ratchet moves
 * without an argument:
 *
 *  - `unproven` 14 → 1. Thirteen headers named a check that PASSES while the
 *    patch reddened a different one, and each was re-aimed at the check its own
 *    log shows failing. The one left is `folder-create-12-toast-bottom-right`,
 *    whose log dates from the worktree package-resolution era and shows three
 *    failures a toast-position patch cannot cause — that one needs a re-run,
 *    not a re-aim, and until it re-runs this number cannot honestly be zero.
 *  - `reddened` 500 → 600, measured at 623. Kept below the live figure because
 *    `wt-break.sh` truncates each patch log at the start of its run, so a sweep
 *    in flight dips the count by however many are mid-rewrite. Still an order
 *    of magnitude above the 51 the escape-strip regression produced, which is
 *    what this floor is for.
 *
 * AND THEN `reddened` WENT 641 → 171, WHICH IS THE ONE MOVE A FLOOR IS NOT
 * ALLOWED TO MAKE QUIETLY. Nothing was measured away: a log now has to be a run
 * of the tree as it is NOW, and 470 of the readable logs are runs of a suite or
 * a product file that has changed since. The old number counted them.
 *
 * The floor is reset to the new true one rather than kept where the softer rule
 * put it, because 600 under this rule is a number no evidence on this machine
 * supports, and a floor that cannot be met is a floor that gets edited every
 * time it speaks. 171 is what is measured against this tree today; the chain in
 * `chain-plan.sh` re-runs the rest, and this rises as it drains.
 *
 * AND THE FLOOR IS ON `accounted`, NOT ON `reddened`, because `reddened` cannot
 * be a ratchet under the provenance gate. Fixing three suites this morning —
 * `list-customize`, `ai-answer-rendering` and `imports`, each of them a section
 * that was ending on a throw instead of reporting — correctly stripped their 13
 * patches of their logs, took reddened from 175 to 162, and FAILED PREFLIGHT ON
 * THE IMPROVEMENT. A floor that punishes fixing the measuring instrument is a
 * floor that will be edited until it stops speaking.
 *
 * `accounted` is reddened plus the patches held back purely on provenance: every
 * patch whose log the reader could READ, whatever the tree said afterwards. A
 * suite fix moves a patch between those two buckets and the sum does not move. A
 * reader regression moves patches out of both — the escape-strip bug would have
 * taken it from 620 to 51 exactly as before — and that is the failure this floor
 * is for.
 *
 * `green` goes 1 → 0 by the same accounting, and it is the more interesting
 * number. All nine greens turned out to be measurements of trees from before
 * their own fixes — `fd-7-toggle-latches` at 06:27 against a check its suite
 * moved at 06:29, and eight more like it. Under the provenance gate they are
 * UNKNOWN, which is what they always were, so 0 is both the strictest floor and
 * the honest one: a patch that reddens nothing on THIS tree has not been aimed.
 */
const BASELINE = { accounted: 760, green: 0, unproven: 1 }

if (!existsSync(LOGS)) {
  console.log('[break-reddened] no break logs on this machine — nothing to check')
  process.exit(0)
}

const lines = (raw, kind) =>
  norm(
    raw
      .split('\n')
      .filter((l) => new RegExp(`\\b${kind}\\b`).test(l))
      .join(' \u0001 '),
  )

const measured = measuredAt(LOGS)
const notCurrent = makeMeasurementCheck({ root: ROOT })

const green = []
const unproven = []
const unknown = []
/*
 * DISQUALIFIED BY PROVENANCE, KEPT APART FROM DISQUALIFIED BY THE READER.
 *
 * These two are both "no usable log" to a reader of the summary and they move
 * for opposite reasons, which the floor below has to be able to tell apart. A
 * suite FIX moves its patches from reddened into here — correctly, their logs
 * are about the old suite — and a reader REGRESSION moves patches into
 * `unknown`. The first is work landing and the second is the failure the floor
 * exists to catch, and with one bucket the floor punished both: fixing three
 * suites this morning took it from 175 to 162 and failed preflight on the
 * improvement.
 */
const drifted = []
const noClaim = []
const unitClaim = []
let reddened = 0

for (const f of readdirSync(BREAKS).filter((x) => x.endsWith('.py')).sort()) {
  const name = f.slice(0, -3)
  const block = reddensText(readFileSync(join(BREAKS, f), 'utf8'))
  /*
   * A `unit:` CLAIM'S EVIDENCE IS A UNIT TEST, AND AN E2E LOG CANNOT SPEAK TO
   * IT. `planner-priorities-1-two-cache-keys-again` points at
   * `use-priorities.test.ts`; its e2e set runs it and reports `0 failed`,
   * correctly, because nothing in that suite is about the query key it changes.
   * Counting that as "a patch that disproves no check" is the same mistake as
   * counting a short run as a reddening: the log is not evidence about this
   * patch either way. Three patches are in this state, and a green from them is
   * neither a finding nor a pass — it is silence, and it is reported as such.
   */
  if (/^#\s*Reddens:\s*unit\b/im.test(block)) {
    unitClaim.push(name)
    continue
  }
  const claims = quotedIn(block)
  if (!claims.length) {
    noClaim.push(name)
    continue
  }
  const log = join(LOGS, `brk-${name}.log`)
  if (!existsSync(log)) {
    unknown.push(`${name} — no run log here`)
    continue
  }
  // The colours come off first. `\bFAIL\b` does not match `\x1b[31mFAIL`,
  // because `m` is a word character — the bug that kept `wt-break.sh` from
  // recording a single failure sentence for 102 of the 113 suites.
  const raw = readFileSync(log, 'utf8').replace(/\x1b\[[0-9;]*m/g, '')
  const totals = raw.match(/^(\d+) passed, (\d+) failed(?:, (\d+) skipped)?/m)
  if (!totals) {
    unknown.push(`${name} — the log has no totals; the run died before them`)
    continue
  }
  /*
   * AND THE LOG HAS TO BE A COMPLETE RUN OF THE SUITE THE PATCH NAMES.
   *
   * `brk-<patch>.log` is whatever suite was being exercised when that patch
   * was applied, and nothing in the filename says which. Two things hide in
   * there, and the same comparison catches both:
   *
   *  - A SHORT RUN. `ai-answer-rendering` declares 51 checks and its logs hold
   *    30, 29, 26, 12 — runs that stopped early, whose "0 failed describes the
   *    part it reached and nothing else". Counting one as a measurement is the
   *    confident zero, and 129 of the 652 readable logs are in this state.
   *  - A RUN OF THE WRONG SUITE. `v1a-2-announce-notifies-the-actor` aims at
   *    `notification-gaps` and was exercised inside the `video1-acceptance`
   *    set, so its `0 failed` is about checks the patch was never pointed at.
   *
   * A log may also simply predate a suite that has since grown checks, which
   * is the same answer: it is not a statement about the file as it is now.
   */
  const ran = Number(totals[1]) + Number(totals[2]) + Number(totals[3] ?? 0)
  const suite = suiteOf(name, readFileSync(join(BREAKS, f), 'utf8'))
  const want = suite ? expectedIn[suite] : 0
  if (!suite || !want) {
    unknown.push(`${name} — no suite with a declared check count to compare the log against`)
    continue
  }
  /*
   * AND IT HAS TO BE A RUN OF THE TREE AS IT IS NOW.
   *
   * Every guard above asks whether the log is a complete run of the right
   * suite. None of them asks whether that suite, or the product under it, is
   * still the one on disk — so a green from before its own fix reads exactly
   * like a green from after it. That is the shape of all nine greens this file
   * currently reports: `fd-7-toggle-latches` was measured at 06:27 against a
   * check the suite moved at 06:29, and the fix was FOR that patch.
   *
   * `brk-<patch>.log` carries no commit of its own — it is the suite's raw
   * output — so the sha comes from the per-suite log that named this patch in
   * the same run, which is what `measuredAt` reads. A log about a tree that has
   * since moved is UNKNOWN: not a green, not a reddening, and counted out loud
   * so that "9 greens" cannot mean "9 unmeasured patches" again.
   */
  const rec = measured.get(name)
  const moved = notCurrent(rec, patchDeps(readFileSync(join(BREAKS, f), 'utf8'), suite))
  if (moved.length) {
    drifted.push(
      `${name} — measured at ${rec?.sha ?? 'an unrecorded commit'}, since when ` +
        `${moved.length} file(s) the run depended on changed (${moved[0]})`,
    )
    continue
  }
  /*
   * UNLESS THE PATCH SAID THE RUN WOULD BE SHORT, in which case the length is
   * the one thing about the log that is not evidence of anything.
   * `acc-7-no-id-returned` declares it: with no container id returned, the
   * twenty-six checks that address that id have nothing to be about, and the
   * check it aims at is among the seven that DID run. Rejecting the log on
   * length left it permanently unreadable — the patch's own outcome held back
   * by the outcome it declared.
   *
   * Only the length guard is waived. The pass-count assertion below still has
   * to hold, because that is the one that catches a log this file cannot parse.
   */
  if (ran !== want && !declaresShortRun(readFileSync(join(BREAKS, f), 'utf8'))) {
    unknown.push(
      `${name} — the log ran ${ran} checks and ${suite} declares ${want}: a short run, a run of ` +
        'another suite, or a run that predates a check this suite has since grown',
    )
    continue
  }
  /*
   * THE PASS LINES MUST ADD UP TO THE PASS COUNT, or nothing below is readable.
   *
   * This file's inference is "the sentence is among the passes", and that is
   * VACUOUSLY SATISFIABLE: if the PASS lines cannot be matched at all, every
   * claim is absent from them and every patch reads as reddened. Found by
   * break-testing this very file — removing the escape-strip above took it from
   * 620 reddened and 27 unproven to 634 and 0, which is the shape of a check
   * that cannot fail, in the check written to catch checks that cannot fail.
   *
   * So the parse is asserted rather than assumed. Measured across all 762 logs
   * with totals on this machine, the PASS line count equals the reported pass
   * count exactly — so an inequality means the log is not being read, and the
   * honest verdict is then UNKNOWN rather than a confident REDDENED.
   */
  const passCount = raw.split('\n').filter((l) => /\bPASS\b/.test(l)).length
  if (passCount !== Number(totals[1])) {
    unknown.push(
      `${name} — ${passCount} PASS line(s) against a reported "${totals[1]} passed", so no ` +
        'single check’s outcome can be read out of this log',
    )
    continue
  }
  if (Number(totals[2]) === 0) {
    green.push(`${name} — the run reported 0 failed`)
    continue
  }
  /*
   * WHOLE CLAIM, NOT A FRAGMENT, AND THE DIFFERENCE IS THIRTEEN PATCHES.
   *
   * `findsClaim` falls back to any five consecutive words of the claim, which is
   * right for the question `check-break-claims.mjs` asks — does this SUITE
   * contain the sentence — because a claim often quotes the literal part of a
   * template literal. It is wrong for the question here, which is whether this
   * particular CHECK passed: a five-word overlap with a NEIGHBOURING check's
   * sentence reads as "the claimed check passed" and the patch comes out
   * unproven.
   *
   * `mp-7-flat-bars` was the one that showed it. Its claim is "the Fast tier's
   * Speed bar is visibly longer than the Max tier's", the run says
   * `FAIL speed measured fast=38px max=38px`, and a fragment of the claim
   * matched a nearby passing sentence. Whole-claim matching moved it, and
   * `lwb-1-noorder`, `acc-13-refs-claims-created` and
   * `folder-create-6-rename-door-open`, into the reddened column where the logs
   * plainly put them.
   */
  const inFails = claims.filter((c) => lines(raw, 'FAIL').includes(c))
  const notInPasses = claims.filter((c) => !lines(raw, 'PASS').includes(c))
  if (inFails.length || notInPasses.length) {
    reddened += 1
    continue
  }
  unproven.push(
    `${name} — ${totals[2]} check(s) failed and all ${claims.length} claimed sentence(s) are among the passes`,
  )
}

const accounted = reddened + drifted.length
console.log(
  `[break-reddened] ${reddened} patch(es) reddened a check they claim · ${green.length} reddened ` +
    `nothing · ${unproven.length} unproven · ${drifted.length} measured against a tree that has ` +
    `moved · ${unknown.length} have no usable log · ${noClaim.length} quote no sentence · ` +
    `${unitClaim.length} claim a unit test`,
)
const show = (label, rows, why) => {
  if (!rows.length) return
  console.log(`\n[break-reddened] ${rows.length} ${label}`)
  console.log(`                 ${why}`)
  for (const r of rows.slice(0, 40)) console.log(`    ${r}`)
  if (rows.length > 40) console.log(`    … and ${rows.length - 40} more`)
}
show(
  'patch(es) REDDENED NOTHING',
  green,
  'the run came back 0 failed, so the patch is not evidence about any check at all',
)
// WORTH PRINTING NOW THAT PROVENANCE HAS ITS OWN BUCKET. This was 633 rows and
// a count was the only readable form; it is 21, and every one of them is a log
// the READER could not read — which is the failure the floor guards, so the
// names belong on screen next to it.
show(
  'patch(es) with a log this cannot read',
  unknown,
  'a run that died before its totals, a run of the wrong length, or a log whose PASS lines do ' +
    'not add up to its own pass count',
)
show(
  'patch(es) UNPROVEN',
  unproven,
  'checks failed, but every claimed sentence also passed — either the patch reddened ' +
    'something else, or the claim is a fragment several loop iterations print',
)

let bad = 0
if (accounted < BASELINE.accounted) {
  console.error(
    `\n[break-reddened] ${reddened} reddened plus ${drifted.length} held back on provenance is ` +
      `${accounted}, down from ${BASELINE.accounted}. A log the reader can read either credits its ` +
      'patch or is set aside because the tree moved; a patch leaving BOTH buckets means the reader ' +
      'stopped reading, or the patch was deleted.',
  )
  bad = 1
}
if (green.length > BASELINE.green) {
  console.error(
    `\n[break-reddened] ${green.length} patches reddened nothing, up from ${BASELINE.green}. ` +
      'A patch that disproves no check is a patch that has not been aimed yet.',
  )
  bad = 1
}
if (unproven.length > BASELINE.unproven) {
  console.error(
    `\n[break-reddened] ${unproven.length} patches are unproven, up from ${BASELINE.unproven}. ` +
      'Either the claim names the wrong check or the suite is not naming its failures.',
  )
  bad = 1
}
if (unknown.length) {
  console.log(
    `\n[break-reddened] ${unknown.length} patch(es) have no usable run log here — see ` +
      '`scripts/e2e-lanes/never-run-plan.mjs` for what that leaves to measure.',
  )
}
process.exit(bad)
