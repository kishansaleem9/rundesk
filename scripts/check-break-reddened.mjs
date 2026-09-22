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
 * Two ratchets, both of which may fall and may not rise.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { norm, quotedIn } from './lib/claim-match.mjs'
import { reddensText, makeSuiteOf } from './lib/suite-of-patch.mjs'

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
const BASELINE = { reddened: 500, green: 2, unproven: 14 }

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

const green = []
const unproven = []
const unknown = []
const noClaim = []
let reddened = 0

for (const f of readdirSync(BREAKS).filter((x) => x.endsWith('.py')).sort()) {
  const name = f.slice(0, -3)
  const claims = quotedIn(reddensText(readFileSync(join(BREAKS, f), 'utf8')))
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
  if (ran !== want) {
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

console.log(
  `[break-reddened] ${reddened} patch(es) reddened a check they claim · ${green.length} reddened ` +
    `nothing · ${unproven.length} unproven · ${unknown.length} have no usable log · ` +
    `${noClaim.length} quote no sentence`,
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
show(
  'patch(es) UNPROVEN',
  unproven,
  'checks failed, but every claimed sentence also passed — either the patch reddened ' +
    'something else, or the claim is a fragment several loop iterations print',
)

let bad = 0
if (reddened < BASELINE.reddened) {
  console.error(
    `\n[break-reddened] only ${reddened} patches reddened a check they claim, down from ` +
      `${BASELINE.reddened}. Measured evidence does not disappear on its own: either the logs ` +
      'stopped being readable, or patches were deleted.',
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
