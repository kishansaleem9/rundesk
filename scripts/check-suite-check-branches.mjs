#!/usr/bin/env node
/**
 * A conditional check makes the run's LENGTH conditional, and every suite here
 * compares its length against `EXPECTED_CHECKS` with `!==`.
 *
 * Put those two facts together and a whole class of regression stops being
 * reportable. `video-regression`'s G13-10 chain reported three checks when the
 * AI dock was missing and seven when it was there, so
 * `vr-4-the-ai-dock-is-only-on-the-ai-page` — which removes the dock — produced
 *
 *     84 passed, 4 failed
 *     ✗ 88 of 92 checks ran — this run stopped early
 *
 * The three FAIL lines naming the missing dock were right there, under a
 * headline that says the RUN is broken. A person reading that reaches for the
 * harness, not for the product. With the chain reporting eight on every path
 * the same patch reddens NINE and the run reaches its own totals.
 *
 * It is not a rare shape. `emoji-picker` section 7 clicked a Try again button
 * that only exists in the failure state, so a build where the picker WORKS
 * threw an uncaught TimeoutError and killed the process before printing
 * anything — which the break harness recorded as a patch that reddened three
 * checks. `addressability-live` guarded three follow-up checks the same way.
 * Four instances in two days, all found by running a patch rather than by
 * reading, which is why this exists.
 *
 * WHAT THIS IS AND IS NOT
 *
 * It is a HEURISTIC over text, and it says so in its own output. It finds an
 * `if (…) { … }` whose body calls `chk(` or `check(` and which has no `else`,
 * by matching braces. That is the shape; it cannot tell whether the condition
 * is ever false in practice. A block guarded by something that is always true
 * on every machine the suite runs on is a false positive, and there is no way
 * to know that from here.
 *
 * So it does NOT fail on a finding. It is a RATCHET over the count, like the
 * break-coverage and break-claims checks beside it: the number may fall and may
 * not rise. A new suite arriving with a conditional check fails the build that
 * brings it, and the existing 55 are worked through with the run's own exit
 * code as the proof — a suite whose branches are balanced can be shown to be,
 * by breaking the condition and watching the count stay put.
 *
 * The fix is `test/e2e/lib/chain.mjs`: give the `if` an `else` that reports the
 * same checks as FAILED, with the reason the branch was not taken. A check that
 * did not run is a check nobody knows the answer to, and the honest way to say
 * that is to fail it with a sentence explaining why.
 *
 * THE ONE EXCEPTION IS A GATE ON THE MACHINE, NOT ON THE PRODUCT — no routable
 * audio output, no object storage configured, an entitlement the tenant does
 * not have. Those are genuinely unknown rather than broken, and `skipRest`
 * reports them as SKIP. It only works where the suite has a `skip` that COUNTS
 * towards the run total, because an uncounted skip is the short run this file
 * exists to find; `syncup-live` is the suite that needed it, and counting its
 * five storage skips is what let it stop keeping a floor and compare exactly.
 * A skip reachable by a PRODUCT regression is a check that cannot fail.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SUITES = join(ROOT, 'test/e2e')
const CHECK_CALL = /\b(chk|check)\s*\(/

/**
 * Walk from the `(` of an `if` to the block's closing `}`.
 *
 * Brace and paren matching only — not a parser. A `{` inside a string or a
 * comment inside the block will throw the count off, and the consequence is a
 * body that reads slightly wrong rather than a crash: the worst case is a
 * finding this reports or misses, which is why the total is a ratchet and not a
 * verdict. Returns null when the `if` is not followed by a braced block, which
 * is the single-statement form and carries no check in this directory.
 */
function ifBlock(src, at) {
  let i = at
  while (i < src.length && src[i] !== '(') i++
  let depth = 0
  do {
    if (src[i] === '(') depth++
    else if (src[i] === ')') depth--
    i++
  } while (i < src.length && depth > 0)
  while (i < src.length && /\s/.test(src[i])) i++
  if (src[i] !== '{') return null
  const open = i
  depth = 0
  do {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
    i++
  } while (i < src.length && depth > 0)
  return { body: src.slice(open + 1, i - 1), end: i }
}

/*
 * HOW MANY SUITES WERE ACTUALLY READ, because both verdicts below are zeros.
 *
 * The header above says "ZERO NOW, ACROSS ALL 113 SUITES" and nothing made that
 * true. `SUITES` resolving to an empty or wrong directory gives `total = 0` and
 * `noCatch = []`, and this prints "0 conditional check block(s) with no else, in
 * 0 suite(s)" and exits 0 — the same shape `check-no-break-patches.mjs` was
 * found in, where relative roots meant a clean verdict over nothing.
 *
 * So the count is asserted and then PRINTED, so the zero carries its
 * denominator: "0 … across 113 suite(s) read" is a claim, and "0" on its own
 * is not. The floor is a floor rather than an equality because suites are still
 * being added.
 */
const MIN_SUITES = 100
const suiteList = readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()
if (suiteList.length < MIN_SUITES) {
  console.error(
    `\n[check-branches] only ${suiteList.length} suite(s) were found under ${SUITES}, below the ` +
      `floor of ${MIN_SUITES}.\nBoth verdicts in this file are zeros, so a scan that reads nothing ` +
      'passes — the zero has to have a\ndenominator. Point this at the suites rather than lowering ' +
      'the floor to meet an empty scan.',
  )
  process.exit(1)
}

const rows = []
let total = 0
for (const file of suiteList) {
  const src = readFileSync(join(SUITES, file), 'utf8')
  const hits = []
  const re = /\bif\s*\(/g
  let m
  while ((m = re.exec(src))) {
    const block = ifBlock(src, m.index)
    if (!block) continue
    if (!CHECK_CALL.test(block.body)) continue
    // An `else` makes the two paths comparable; whether they report the SAME
    // number is beyond a text match, and the suite's own count guard is what
    // settles that. This asks only whether an alternative exists at all.
    if (/^\s*else\b/.test(src.slice(block.end, block.end + 40))) continue
    hits.push(src.slice(0, m.index).split('\n').length)
  }
  if (hits.length) {
    rows.push([file, hits])
    total += hits.length
  }
}

console.log(
  `[check-branches] ${total} conditional check block(s) with no else, in ${rows.length} of ` +
    `${suiteList.length} suite(s) read.`,
)
console.log('                 A heuristic over text: it finds the SHAPE, not whether the')
console.log('                 condition is ever false. Read each one before changing it.')
for (const [file, lines] of rows) {
  console.log(`  ${String(lines.length).padStart(3)}  ${file}  (lines ${lines.join(', ')})`)
}

/*
 * THE RATCHET. Lower it as branches are balanced; never raise it to pass.
 *
 * 55 when this was written, across the ten suites whose branches nobody had
 * ever exercised — which is very nearly the same list as the eleven suites the
 * coverage checker could not see, and for the same reason. A suite with no
 * break patch is a suite whose conditions have never been made false.
 *
 * ZERO NOW, ACROSS ALL 113 SUITES, so this holds a floor rather than measuring
 * a backlog. Balanced: `video1-fast-items` (fifteen), `syncup-live` (ten),
 * `video-regression` (nine), `ui-sweep` (seven), `panel-collapse` (six),
 * `task-depth` (four), `addressability-live` (four), `person-panel` (two), and
 * one each in `emoji-picker`, `loading-states` and `stale-chunk-recovery`.
 *
 * The last one found a check whose SENTENCE was a statement about the fixture:
 * `ui-sweep`'s "two members with unambiguous names to drive the cycle with"
 * failed when the workspace could not supply a pair, naming nothing in the
 * product and leaving the run a check shorter than the path beside it. A reason
 * belongs in the detail, not in the claim. The fix is
 * `test/e2e/lib/chain.mjs` — `step` for the next check, `rest` to report the
 * remainder as failed with the reason, and `skipRest` for a gate on the
 * machine rather than on the product, which is the narrow case where the
 * honest answer is "unknown" rather than "broken". Keep this paragraph in step
 * with the constant.
 *
 * AND A HEURISTIC THAT CANNOT SEE A FIX KEEPS REPORTING ONE. `loading-states`
 * balanced its panel loop with an early `continue` rather than an `else` — the
 * branches really did report two checks either way — and this kept flagging it,
 * because it matches the SHAPE. The cheapest honest answer is to write the shape
 * the checker can read; the alternative is a permanent known-false entry in a
 * list whose whole value is that every line in it is worth reading.
 *
 * EVERY BALANCED SUITE WAS RE-RUN AND ITS COUNT HELD. `video1-fast-items` is
 * 92 of 92, `task-depth` 91, `panel-collapse` 56, `ui-sweep` 107 — the point of
 * the fix is that the happy path reports the same number it always did, and a
 * refactor that quietly changed it would be the defect this whole sweep is
 * about. `syncup-live` is the one that moved, 48 → 59, and it moved because a
 * floor became an exact count with skips included.
 */
/*
 * AND THE SAME FAMILY, ONE LEVEL WORSE: A SUITE THAT CANNOT REPORT A FAILURE.
 *
 * Everything above is about a run that reports the WRONG NUMBER of checks.
 * `planner-onboarding` reported none at all — `try { … } finally { … }` with no
 * catch, so `po-1-panel-never-shows` left the process on an uncaught
 * TimeoutError before the totals line and before the `EXPECTED_CHECKS` guard.
 * `wt-break.sh` recorded `NO SUMMARY: … it died before the totals`, which is
 * the one outcome that says nothing whatsoever about a patch.
 *
 * Three of the 113 were in that state — `planner-onboarding`,
 * `planner-command-bar`, `team-schedules` — and all three were in a running
 * plan at the time. A suite with a top-level `try` must have a `catch` that
 * records the throw, so the totals and the guard always print.
 *
 * TEXT, LIKE THE REST OF THIS FILE: it asks whether a top-level `try` has a
 * top-level `catch`, not whether the catch does anything sensible.
 */
const noCatch = []
for (const f of suiteList) {
  const src = readFileSync(join(SUITES, f), 'utf8')
  if (/^try \{/m.test(src) && !/^\} catch\b/m.test(src)) noCatch.push(f.slice(0, -4))
}
if (noCatch.length) {
  console.error(
    `\n[check-branches] ${noCatch.length} suite(s) have a top-level \`try\` and no \`catch\`, so a ` +
      'throw ends the process before the totals and the EXPECTED_CHECKS guard — the one outcome ' +
      'that says nothing about a patch at all:',
  )
  for (const n of noCatch) console.error(`    ${n}`)
  process.exit(1)
}

/*
 * AND THE GUARD THAT EVERY RULE IN THIS FILE RESTS ON.
 *
 * Everything above is about a run's LENGTH being honest, and the reason length
 * matters at all is one line each suite carries:
 *
 *     if (results.length !== EXPECTED_CHECKS) { … }
 *
 * That `!==` is what turns a short run into a reported failure instead of a
 * `0 failed` nobody questions. It is the single assumption the whole sweep
 * stands on — "0 failed is not it ran" — and NOTHING WAS CHECKING IT. A suite
 * added without the constant, or with the comparison written `<` because a
 * skip was expected, would report a truncated run as a clean one and every
 * patch measured against it would be credited for checks that never ran.
 *
 * Measured 22 September: all 113 declare it and all 113 compare with `!==`.
 * This is a gate rather than a ratchet, because unlike the heuristic above,
 * the presence of a constant and the operator beside it are not a guess about
 * text — they are the text.
 *
 * `>=` and `<` are called out separately from a missing constant because they
 * are the plausible mistake: a suite with a conditional skip reaches for a
 * range comparison, and that is exactly the suite whose length cannot be
 * trusted.
 */
const noGuard = []
for (const file of suiteList) {
  const src = readFileSync(join(SUITES, file), 'utf8')
  const name = file.slice(0, -4)
  if (!/^const EXPECTED_CHECKS = \d+/m.test(src)) {
    noGuard.push([name, 'declares no EXPECTED_CHECKS at all'])
    continue
  }
  const ops = [
    ...src.matchAll(/\w+(?:\.length)?\s*(!==|===|<=|>=|<|>)\s*EXPECTED_CHECKS|EXPECTED_CHECKS\s*(!==|===|<=|>=|<|>)/g),
  ].map((m) => m[1] ?? m[2])
  if (!ops.length) noGuard.push([name, 'declares EXPECTED_CHECKS and never compares it'])
  else if (!ops.includes('!==')) noGuard.push([name, `compares it with ${[...new Set(ops)].join(', ')} — not \`!==\``])
}
if (noGuard.length) {
  console.error(
    `\n[check-branches] ${noGuard.length} suite(s) cannot report a short run, which is the one ` +
      'thing every number\nin this audit depends on:',
  )
  for (const [n, why] of noGuard) console.error(`    ${n} — ${why}`)
  console.error(
    '\n  A run that stops early prints `0 failed` for the checks it never reached, and the break\n' +
      '  harness credits the patch with every one of them. `EXPECTED_CHECKS` compared with `!==` is\n' +
      '  what makes that a reported failure instead. Exact, not a range: a skip that should count\n' +
      '  towards the total belongs in the total (see `skipRest`), not in a loosened comparison.',
  )
  process.exit(1)
}

const BASELINE = 0
if (total > BASELINE) {
  console.error(`\n[check-branches] WORSE: ${BASELINE} → ${total}.`)
  console.error('  A conditional check makes the run length conditional, and EXPECTED_CHECKS is')
  console.error('  compared with !==. Give the `if` an `else` that fails the same checks with the')
  console.error('  reason, rather than raising this number.')
  process.exit(1)
}
if (total < BASELINE) {
  console.log(`\n[check-branches] better — lower the baseline in this file to ${total}`)
}
process.exitCode = 0
