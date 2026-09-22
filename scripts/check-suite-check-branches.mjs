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
 * The fix is always the same and always cheap: give the `if` an `else` that
 * reports the same checks as failed, with the reason the branch was not taken.
 * "Skipped" is not a third outcome these suites have. A check that did not run
 * is a check nobody knows the answer to, and the honest way to say that is to
 * fail it with a sentence explaining why.
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

const rows = []
let total = 0
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
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
  `[check-branches] ${total} conditional check block(s) with no else, in ${rows.length} suite(s).`,
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
 */
const BASELINE = 55
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
process.exit(0)
