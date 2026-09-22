#!/usr/bin/env node
/**
 * Every break patch claims, in its own header, which check it reddens:
 *
 *     # Reddens: teams-empty-state: "there are the frame's two explainer cards"
 *
 * That line is the only thing tying a patch to the thing it proves, and nothing
 * has ever verified it. `teams-empty-state-1-one-card` named a check that had
 * not existed for a day — the frame shows three cards in a carousel, and the
 * check asserting two was one of the five that passed against a broken build —
 * so the patch would, if "repaired", have been re-aimed at the wrong count. It
 * was found by reading it. There are 744 patches.
 *
 * This checks three things that a `PATCH FAILED` line never will, because a
 * patch whose claim has rotted still applies perfectly:
 *
 *   1. the patch says what it reddens at all;
 *   2. the suite it names exists;
 *   3. the check sentence it quotes is really in that suite.
 *
 * The matching itself is in `scripts/lib/claim-match.mjs`, shared with
 * `check-break-coverage.mjs` — quoted text compared after normalising quotes,
 * dashes and whitespace away, and a sentence assembled from a template literal
 * matched on its longest literal fragment, because the interpolated part is not
 * in the file at all. It is one module because it was two and they had drifted;
 * the reasoning is over there. A claim that cannot be checked either way is
 * counted as UNVERIFIABLE rather than as a failure — a check that says "I could
 * not tell" is worth more than one that guesses.
 *
 * It is a RATCHET rather than a verdict; the reasoning is at the bottom.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { norm, findsClaim, quotedIn } from './lib/claim-match.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BREAKS = join(ROOT, 'test/e2e/breaks')
const SUITES = join(ROOT, 'test/e2e')

/**
 * The `Reddens:` block: the line itself plus any `#` lines that continue it.
 *
 * ONLY THE FIRST ONE IS READ, WHICH IS WHY A SECOND IS REPORTED. Correcting a
 * patch header from a run is the commonest edit in this directory, and adding
 * the newly-observed sentences as a fresh `# Reddens:` paragraph is the natural
 * way to do it — `cma-2-reminder-prefill-is-utc` gained a second block that
 * way. `findIndex` takes the first, so everything in the second is invisible
 * here: the claim verifies, the patch is attributed, and the extra sentences
 * are neither checked nor counted. Silently ignoring half a header is the
 * shape of defect this file exists to catch.
 *
 * THIRTEEN PATCHES HAD ONE WHEN THIS WAS ADDED, and they were not new mistakes
 * — they were the format changing. Each carried a legacy `# REDDENS:
 * <suite>.mjs — "…"` line above the canonical one, from before the machine-
 * readable spelling was settled, and in two of them the legacy line named a
 * sentence the canonical block does not: `nor does Month, which spans five of
 * them` and `outside the schedule are dimmed`. Both were real checks in real
 * suites, claimed by nothing and verified by nothing for as long as the second
 * line existed. The legacy lines are gone and those two sentences are claimed.
 */
const reddensBlock = (lines) => {
  const i = lines.findIndex((l) => /^#\s*Reddens:/i.test(l))
  if (i === -1) return null
  const out = [lines[i].replace(/^#\s*Reddens:\s*/i, '')]
  for (let j = i + 1; j < lines.length; j++) {
    if (!/^#/.test(lines[j])) break
    // A continuation is indented under the Reddens line; a new paragraph is not.
    if (!/^#\s{2,}\S/.test(lines[j])) break
    out.push(lines[j].replace(/^#\s*/, ''))
  }
  return out.join(' ')
}

/*
 * TWO FORMATS, BOTH LEGITIMATE, and the first version of this script only knew
 * one. `# Reddens: <suite>: "…"` names the suite; `# Reddens: "…"` does not,
 * because the patch's FILENAME carries it — `integration-error-card-1-…` is a
 * patch for `integration-error-card`. Insisting on the explicit form reported
 * 136 patches as naming a suite that does not exist, which is not a finding
 * about the patches at all. The suite is resolved here the way a reader does
 * it: what the header says, else the longest filename prefix that is a suite,
 * else whichever suite actually contains the sentence.
 */
const suiteFiles = readdirSync(SUITES).filter((f) => f.endsWith('.mjs'))
const hayOf = new Map()
const hayFor = (s) => {
  if (!hayOf.has(s)) hayOf.set(s, norm(readFileSync(join(SUITES, `${s}.mjs`), 'utf8')))
  return hayOf.get(s)
}
const prefixSuite = (name) => {
  const parts = name.split('-')
  for (let n = parts.length; n > 0; n--) {
    const cand = parts.slice(0, n).join('-')
    if (existsSync(join(SUITES, `${cand}.mjs`))) return cand
  }
  return null
}
const suitesContaining = (q) =>
  suiteFiles.map((f) => f.slice(0, -4)).filter((s) => findsClaim(hayFor(s), q))

const files = readdirSync(BREAKS).filter((f) => f.endsWith('.py')).sort()
const twoBlocks = []
const noClaim = []
const noSuite = []
const notFound = []
let unverifiable = 0
let crossSuite = 0
let ok = 0

for (const f of files) {
  const name = f.slice(0, -3)
  const lines = readFileSync(join(BREAKS, f), 'utf8').split('\n')
  if (lines.filter((l) => /^#\s*Reddens:/i.test(l)).length > 1) twoBlocks.push(name)
  const block = reddensBlock(lines)
  if (!block) {
    noClaim.push(name)
    continue
  }
  // `unit:` claims point at a *.test.ts, which this does not try to parse.
  if (/^unit\b/i.test(block.trim())) {
    unverifiable++
    continue
  }
  const quoted = quotedIn(block)
  if (quoted.length === 0) {
    unverifiable++
    continue
  }
  const named = (block.match(/^([a-z0-9][a-z0-9-]*)\s*:/i) || [])[1]
  const suite =
    (named && existsSync(join(SUITES, `${named}.mjs`)) && named) || prefixSuite(name) || null

  if (suite) {
    const hay = hayFor(suite)
    const absent = quoted.filter((q) => !findsClaim(hay, q))
    /*
     * A PATCH CAN REDDEN CHECKS IN MORE THAN ONE SUITE, and this had no model
     * for it. `paywall-sites-3-gate-list-export` widens an export gate, and its
     * header names three sentences from its own suite and a fourth followed by
     * the words "and in list-export.mjs" — which is true, and was reported as a
     * rotted claim because the resolved suite does not contain it.
     *
     * A sentence that is somewhere in `test/e2e` is a real check; the patch is
     * simply aimed at two suites. Counted separately rather than folded into
     * `verified`, because it is worth being able to see how many patches cross
     * a suite boundary — that is where a run of one suite can be misread as
     * having proved something about another.
     */
    const cross = absent.filter((q) => suitesContaining(q).length > 0)
    const missing = absent.filter((q) => !cross.includes(q))
    if (missing.length) notFound.push([name, suite, missing])
    else if (cross.length) crossSuite++
    else ok++
    continue
  }
  // No suite named and none derivable from the filename: the sentence itself
  // decides. Found in exactly one suite is as good as being told which.
  const missing = quoted.filter((q) => suitesContaining(q).length === 0)
  if (missing.length) noSuite.push([name, named ?? '(none named)', missing])
  else ok++
}

for (const [name, suite, missing] of notFound) {
  console.log(`CLAIM NOT IN SUITE  ${name}`)
  console.log(`                    names ${suite}.mjs, which does not contain:`)
  for (const m of missing) console.log(`                      "${m}"`)
}
for (const name of twoBlocks) {
  console.log(`TWO REDDENS BLOCKS ${name}`)
  console.log('                    only the first is read — merge them into one block')
}
for (const [name, , missing] of noSuite) {
  console.log(`CLAIM IN NO SUITE   ${name}`)
  console.log(`                    names no suite, and no suite anywhere contains:`)
  for (const m of missing) console.log(`                      "${m}"`)
}

console.log(
  `\n[break-claims] ${ok} verified · ${crossSuite} verified in another suite · ${unverifiable} unverifiable (unit claims, or no quoted ` +
    `sentence) · ${notFound.length} claim a check their suite does not have · ${noSuite.length} ` +
    `quote a sentence no suite contains · ${noClaim.length} make no claim at all`,
)
if (noClaim.length) {
  console.log(`\n[break-claims] patches with no "# Reddens:" line — unreviewable, since nothing`)
  console.log(`               says which check they are supposed to prove:`)
  for (const n of noClaim.slice(0, 40)) console.log(`                 ${n}`)
  if (noClaim.length > 40) console.log(`                 … and ${noClaim.length - 40} more`)
}

/*
 * A RATCHET, NOT A VERDICT — AND IT IS NOW AT ZERO, SO IT HOLDS A FLOOR
 * RATHER THAN MEASURING A BACKLOG. KEEP THIS PARAGRAPH IN STEP WITH THE
 * CONSTANT.
 *
 * It started at 36 patches quoting a sentence their suite does not have and
 * 121 quoting nothing at all. Some of that was real rot — `teams-empty-state-1`
 * named a check that had been deleted — and most of the rest was a patch
 * paraphrasing where it should have quoted (`"laid out as two rows of four"`
 * against the suite's `and lays the eight tiles out as two rows of four`). All
 * 157 are closed: every paraphrase was replaced with the suite's own sentence,
 * and the handful that could not be — `aoc-4-attach-input-unnamed` breaks the
 * gate that runs BEFORE the first check, so there is no check sentence in
 * existence to name — say so in prose instead of quoting runtime output, which
 * a checker can only read as a check that does not exist.
 *
 * The two obvious ways to register a check in that state are both bad in ways
 * this audit has names for. Failing on arrival makes a red build the normal
 * state, and a check everybody steps over is worse than none. Exiting 0 with
 * the findings printed is a check that cannot fail.
 *
 * So it fails when a number GROWS. From zero that means it fails on the first
 * refactor that orphans a claim and on the first patch that makes none, which
 * is the whole of what it is for now: `unverifiable` is deliberately NOT
 * ratcheted, because a `unit:` claim and a patch that legitimately quotes
 * nothing both land there, and a ratchet over them would push the next author
 * into quoting something rather than saying there is nothing to quote.
 */
const BASELINE = { notFound: 0, noSuite: 0, noClaim: 0, twoBlocks: 0 }
const actual = {
  notFound: notFound.length,
  noSuite: noSuite.length,
  noClaim: noClaim.length,
  twoBlocks: twoBlocks.length,
}
const grew = Object.keys(BASELINE).filter((k) => actual[k] > BASELINE[k])
if (grew.length) {
  console.error('\n[break-claims] THIS IS WORSE THAN THE BASELINE:')
  for (const k of grew) console.error(`  ${k}: ${BASELINE[k]} → ${actual[k]}`)
  console.error('  Fix the patch, or fix the check it names. Do not raise the baseline to pass.')
  process.exit(1)
}
const shrank = Object.keys(BASELINE).filter((k) => actual[k] < BASELINE[k])
if (shrank.length) {
  console.log('\n[break-claims] better than the baseline — lower it in this file:')
  for (const k of shrank) console.log(`  ${k}: ${BASELINE[k]} → ${actual[k]}`)
}
process.exit(0)
