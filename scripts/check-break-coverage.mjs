#!/usr/bin/env node
/**
 * How many suites have ever had a break patch written for them at all.
 *
 * THE AUDIT HAS BEEN REPORTING "N break-tested" PER ROW AND NEVER THE
 * DENOMINATOR. Counted on 21 September: 101 suites carry 1961 checks between
 * them, and **47 suites had no break patch at all** — including the largest
 * ones in the repository: `video-regression` (81 checks),
 * `custom-field-progress` (58), `task-menu` (33), `comment-recording` (32),
 * `a61-meeting-record` (28), `task-merge` and `list-export` (25 each).
 *
 * THE FIRST ANSWER WAS 53, AND IT WAS REPORTED BEFORE IT WAS CHECKED. That
 * version attributed a patch by `# Reddens: <suite>:` or by a filename prefix,
 * and missed two shapes: `# Reddens: task-field-create — "…"` separates with an
 * EM DASH, and the abbreviated prefixes (`tfc-`, `taf-`, `tai-`, `lwb-`) match
 * no suite filename. 64 patches went unattributed and four suites that DO have
 * patches were counted as having none. The pile of unattributed patches was
 * sitting in the output the whole time as a number in brackets.
 *
 * Twenty-eight have been closed since — `task-menu`, `custom-field-progress`,
 * `list-export`, `task-merge`, `comment-recording`, `view-visibility`,
 * `list-name-taken`, `checklists`, `ai-value`, `planner-blocks`,
 * `login-workspace-binding`, `space-presets`, `doc-task-links`,
 * `malformed-ids`, `trending-sort`, `undo-delete`, `task-provenance`,
 * `search-sources`, `bookmarks`, `list-statuses-seeded`, `list-save-view`,
 * `replies-inline-thread`, `request-access`, `planner-priorities`,
 * `space-features` and `assign-to-priorities` among them — and then all 47.
 * The count printed is always the current one; the paragraph above is what it
 * was when anybody first looked, and the one below is what happened when the
 * denominator was finally checked too.
 *
 * KEEP THIS PARAGRAPH IN STEP WITH THE CONSTANT. It said 37 while the constant
 * said 27, which is the stale-reason defect in the file that exists to stop a
 * number describing something it no longer describes.
 *
 * IT REACHED ZERO, AND THE ZERO WAS FALSE. Every one of the 101 suites this
 * file could SEE had a patch aimed at it — and it could see 101 of 113, because
 * the count came from grepping `\bchk\(` and eleven suites name their helper
 * `check(`. 633 checks in `ui-sweep`, `task-depth`, `video1-fast-items`,
 * `chat-message-actions`, `settings-depth`, `panel-collapse`, `syncup-live`,
 * `addressability-live`, `stale-chunk-recovery`, `loading-states` and
 * `emoji-picker` were outside the denominator, so they could not appear in the
 * uncovered list however long nobody wrote a patch for them.
 *
 * The count is each suite's own `EXPECTED_CHECKS` now, for the reasons written
 * above it, and when the denominator was corrected the real numbers were
 * **113 suites · 2726 checks · 11 uncovered**. 47 → 0 → 11 is one number being
 * corrected, not two regressions; the ratchet's own comment at the bottom says
 * which of those moves is legitimate and why. The printed numbers are always
 * the current ones — only the constant at the bottom is kept in step by hand.
 *
 * AND ZERO HERE STILL DOES NOT MEAN "IT WORKS". Read the paragraph below about
 * `save-comment`: this counts aim, and the ledger's §8 counts what reddened.
 *
 * A suite with no patch is not a suite that failed. It is a suite about which
 * nothing is known: every one of its checks may be a facade, and being green
 * says nothing either way. That is the same sentence this audit has applied to
 * individual checks since step 6 was written down, and it had never been
 * applied to the set of suites as a whole.
 *
 * This is deliberately NOT a count of checks proven. One patch can redden
 * several checks and most do; the honest thing a static reading can say is
 * whether a suite has ever been AIMED at, and it says that.
 *
 * AND IT CANNOT TELL WHETHER THE AIM WAS ANY GOOD. `save-comment` counted as
 * covered while both its patches edited `notifications.snoozedUntil` — the
 * snooze that puts a NOTIFICATION in the Later tab — and the suite reads
 * `task_comment_saves`, a different table behind a different endpoint. Their
 * `# Reddens:` lines quoted real sentences from the suite, so
 * `check-break-claims.mjs` verified them and this file attributed them; both
 * ran green because they had nothing to do with the feature.
 *
 * No static reading can catch that: the claim was true and the code was wrong.
 * Only the run distinguishes a patch aimed at a suite from a patch that
 * reaches it.
 *
 * AND THE RUN NOW SAYS SO MECHANICALLY. `check-break-reddened.mjs` prints
 * "<n> of 113 suite(s) have a patch measured against this tree to redden a
 * check it names" — the strongest form of this claim, which §8 had been making
 * by reading one suite at a time. This file stays as it is, because a static
 * reading answering a static question is the right division: aim here, proof
 * there. So this number means "somebody has tried", and the ledger's
 * section 8 — which records what actually reddened — is where "it works" is
 * written down.
 *
 * Registered as a ratchet: the count of uncovered suites may fall and may not
 * rise, so a new suite arrives with a patch or fails the build that brings it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeSuiteOf } from './lib/suite-of-patch.mjs'
import { bail } from './lib/bail.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SUITES = join(ROOT, 'test/e2e')
const BREAKS = join(ROOT, 'test/e2e/breaks')

const suiteNames = readdirSync(SUITES)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => f.slice(0, -4))

/*
 * THE CHECK COUNT IS THE SUITE'S OWN `EXPECTED_CHECKS`, AND COUNTING `chk(`
 * INSTEAD HID TWELVE WHOLE SUITES.
 *
 * This grepped for `\bchk\(` and gated everything on `checksIn[n] > 0`, so a
 * suite whose helper is called something else counted zero checks and was
 * dropped from `withChecks` — which means it could not appear in the uncovered
 * list either. Twelve TRACKED suites name theirs `check(`:
 * `ui-sweep` (107), `task-depth` (91), `video1-fast-items` (92),
 * `chat-message-actions` (73), `settings-depth` (61), `person-panel` (59),
 * `panel-collapse` (56), `syncup-live` (48), `addressability-live` (28),
 * `stale-chunk-recovery` (27), `loading-states` (26), `emoji-picker` (24) —
 * 692 checks. **"0 suites have NO break patch at all" was true of the 101 this
 * file could see and silent about those twelve.** A confident zero produced by
 * the identifier a helper happens to be named.
 *
 * `EXPECTED_CHECKS` is a better denominator than any grep for a call site. All
 * 113 files here declare one, it is the EXACT runtime count rather than a
 * static approximation, and each suite compares its own result against it with
 * `!==` on every run — so unlike a `chk(` tally it cannot drift from what the
 * suite actually does. It also stops counting a wrapper: `video-regression`
 * routes fourteen of its checks through a local `g13()` that reports one of
 * eight fixed sentences, and the grep saw 67 where the suite runs 93.
 *
 * A file that declares no `EXPECTED_CHECKS` counts zero and is skipped, which
 * is the same gate as before for anything in here that is not a suite.
 */
const checksIn = {}
for (const n of suiteNames) {
  const src = readFileSync(join(SUITES, `${n}.mjs`), 'utf8')
  checksIn[n] = Number(src.match(/^const EXPECTED_CHECKS = (\d+)/m)?.[1] ?? 0)
}


/*
 * ATTRIBUTION HAS THREE STEPS, AND THE FIRST VERSION HAD ONE AND A HALF.
 *
 * It read `# Reddens: <suite>:` and fell back to the filename prefix. That
 * missed two whole shapes and produced a headline number that was too big:
 *
 *   - `# Reddens: task-field-create — "…"` separates with an EM DASH, not a
 *     colon. Nine `tfc-*` patches were invisible to it;
 *   - the abbreviated prefixes — `tfc-`, `taf-`, `tai-`, `lwb-` — match no
 *     suite filename, so the fallback could not save them either.
 *
 * 64 patches went unattributed and four suites that DO have patches were
 * reported as having none, which was published as "53 suites have never had a
 * single break patch" before anybody checked the unattributed pile. So the
 * third step is the one `check-break-claims.mjs` already uses: ask which suite
 * actually contains the sentence the patch quotes. A patch that names its check
 * can always be attributed, whatever punctuation it used.
 *
 * THE MATCHER THAT ANSWERS THAT QUESTION IS SHARED — `scripts/lib/claim-match.mjs`
 * — because it was copied here and the copies drifted. This one had neither the
 * dash fold nor the backtick unescape the other had grown, so the two files
 * could disagree about whether the same claim is in the same suite while each
 * printed a number that looked authoritative on its own.
 */
// ALL THREE STEPS LIVE IN `scripts/lib/suite-of-patch.mjs` NOW, because they
// lived here and in three other files and the four had drifted. Freshness kept
// only step one, with a delimiter set that truncated `sidebar-dms` to
// `sidebar` — so 24 patches this file attributes were reported there as naming
// no suite, and the run plan built from that list could not schedule them.
const suiteOf = makeSuiteOf({
  suiteDir: SUITES,
  candidates: suiteNames.filter((n) => checksIn[n] > 0),
})

const patches = {}
const unattributedNames = []
for (const f of readdirSync(BREAKS).filter((x) => x.endsWith('.py'))) {
  const text = readFileSync(join(BREAKS, f), 'utf8')
  const suite = suiteOf(f.slice(0, -3), text)
  if (suite) patches[suite] = (patches[suite] ?? 0) + 1
  else unattributedNames.push(f.slice(0, -3))
}
const unattributed = unattributedNames.length

const withChecks = suiteNames.filter((n) => checksIn[n] > 0)
const uncovered = withChecks.filter((n) => !patches[n]).sort((a, b) => checksIn[b] - checksIn[a])
const totalChecks = withChecks.reduce((a, n) => a + checksIn[n], 0)
const totalPatches = Object.values(patches).reduce((a, b) => a + b, 0)

/*
 * THE POPULATION, ASKED BEFORE THE VERDICT, BECAUSE THE VERDICT IS A ZERO.
 *
 * `uncovered` is the suites with checks and no patch, and the ratchet below
 * fails when it grows past zero. Over an EMPTY corpus it is also zero: point
 * `SUITES` elsewhere and this printed "0 suites · 0 checks · 0 patches
 * attributed (809 could not be attributed to a suite)" and exited 0. Measured,
 * not supposed — the same probe that found the break-patch guard's relative
 * roots and the frame checker's missing floor.
 *
 * The information was right there in the line: 809 unattributed. Nothing gated
 * on it. So the three numbers the verdict rests on are floored, and the failure
 * says which one gave way.
 *
 * Measured 22 September: 113 suites · 2,763 checks · 806 patches attributed.
 */
const FLOORS = { suites: 100, checks: 2_000, attributed: 700 }
const below = [
  withChecks.length < FLOORS.suites &&
    `${withChecks.length} suite(s) with checks, below ${FLOORS.suites}`,
  totalChecks < FLOORS.checks && `${totalChecks} check(s) in total, below ${FLOORS.checks}`,
  totalPatches < FLOORS.attributed &&
    `${totalPatches} patch(es) attributed to a suite, below ${FLOORS.attributed}` +
      (unattributed ? ` — with ${unattributed} that could not be attributed at all` : ''),
].filter(Boolean)
if (below.length) {
  console.error('\n[break-coverage] this check has nothing to be about as it stands:\n')
  for (const b of below) console.error(`  · ${b}`)
  console.error(
    '\n"0 suites have NO break patch at all" is vacuously true of 0 suites. Fix the scan rather\n' +
      'than the floor, unless the corpus genuinely shrank — and then say here which suites went\n' +
      'and why, the way the ratchet below is moved.',
  )
  await bail(1)
}

console.log(
  `[break-coverage] ${withChecks.length} suites · ${totalChecks} checks · ${totalPatches} patches ` +
    `attributed (${unattributed} could not be attributed to a suite)`,
)
console.log(`[break-coverage] ${uncovered.length} suites have NO break patch at all:`)
for (const n of uncovered) console.log(`    ${String(checksIn[n]).padStart(3)} checks  ${n}`)
if (unattributedNames.length) {
  /*
   * NAMED, NOT COUNTED, because a bare count of them is how the first version
   * of this file hid four covered suites: 64 unattributed patches were
   * published as "53 suites have never had a single break patch".
   *
   * What lands here now is not rot. `amp-2-opus-unpriced` reddens a Vitest
   * file — `# Reddens: unit: model-tiers.test.ts "…"` — and a browser suite's
   * coverage number is the wrong place to count it; there is no `test/e2e`
   * suite it belongs to. That is why these are printed by name: the list is
   * meant to be read and each line judged, not summed.
   */
  console.log(`\n[break-coverage] ${unattributedNames.length} patches name no e2e suite, so they`)
  console.log('               belong to none here and count towards none:')
  for (const n of unattributedNames) console.log(`    ${n}`)
}

/*
 * THE RATCHET. Lower it when a suite is covered; never raise it to pass.
 *
 * IT WENT 47 → 0 AND IS NOW 11, AND THAT IS NOT THE RATCHET BEING RAISED TO
 * PASS. READ THIS BEFORE TOUCHING THE NUMBER.
 *
 * The zero was measured with a `chk(` grep, which cannot see a suite whose
 * helper is called `check(`. Eleven tracked suites carrying 633 checks —
 * `ui-sweep`, `video1-fast-items`, `task-depth`, `chat-message-actions`,
 * `settings-depth`, `panel-collapse`, `syncup-live`, `addressability-live`,
 * `stale-chunk-recovery`, `loading-states`, `emoji-picker` — were not in the
 * denominator, so they could not be in the uncovered list. The 47 that were
 * closed were really closed; the eleven were never counted.
 *
 * So the number did not get worse. It got MEASURED. The distinction that
 * matters, and the one this paragraph exists to stop anybody hiding behind:
 * raising this constant is legitimate ONLY when the measurement changed and
 * the new number is the true one, said out loud, with the suites named. It is
 * never legitimate for a suite that had a patch and lost it — that is the
 * regression this check exists to catch, and it still fails on it.
 *
 * 11 → 0, AND THIS ONE IS MEASURED AGAINST THE WHOLE DENOMINATOR. All eleven
 * are closed: `emoji-picker`, `loading-states`, `stale-chunk-recovery`,
 * `addressability-live`, `panel-collapse`, `syncup-live`, `settings-depth`,
 * `chat-message-actions`, `task-depth`, `video1-fast-items` and `ui-sweep` —
 * 633 checks that were outside the count when the zero above was declared, and
 * the largest suites in the repository.
 *
 * So the number is zero again and it means something different: every one of
 * the 113 suites has at least one patch aimed at it, counted by each suite's
 * own `EXPECTED_CHECKS` rather than by grepping for a helper's name. A NEW
 * suite arriving without a patch is the only thing that can move it, which is
 * exactly the moment this check is worth failing on.
 *
 * AND ZERO STILL DOES NOT MEAN "IT WORKS" — read the `save-comment` paragraph
 * below. This counts aim. What reddened is in the ledger's §8, and of the
 * eleven sets written to reach this zero, four patches ran GREEN on their first
 * run and every one of those four was a defect in the CHECK rather than in the
 * patch.
 */
const BASELINE_UNCOVERED = 0
if (uncovered.length > BASELINE_UNCOVERED) {
  console.error(
    `\n[break-coverage] WORSE: ${BASELINE_UNCOVERED} → ${uncovered.length} suites with no break patch.`,
  )
  console.error('  A new suite arrives with a patch, or this build fails. Do not raise the baseline.')
  await bail(1)
}
if (uncovered.length < BASELINE_UNCOVERED) {
  console.log(`\n[break-coverage] better — lower the baseline in this file to ${uncovered.length}`)
}
process.exitCode = 0
