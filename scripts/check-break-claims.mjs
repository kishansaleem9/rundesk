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
 * was found by reading it. There are 573 patches.
 *
 * This checks three things that a `PATCH FAILED` line never will, because a
 * patch whose claim has rotted still applies perfectly:
 *
 *   1. the patch says what it reddens at all;
 *   2. the suite it names exists;
 *   3. the check sentence it quotes is really in that suite.
 *
 * Quoted text is compared after normalising quotes, dashes and whitespace away
 * (see `norm`), and a sentence assembled from a template literal is matched on
 * its leading fragment (see `findsClaim`), because the interpolated part is not
 * in the file at all. A claim that cannot be checked either way is counted as
 * UNVERIFIABLE rather than as a failure — a check that says "I could not tell"
 * is worth more than one that guesses.
 *
 * It is a RATCHET rather than a verdict; the reasoning is at the bottom.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BREAKS = join(ROOT, 'test/e2e/breaks')
const SUITES = join(ROOT, 'test/e2e')

/*
 * NORMALISE UNTIL ONLY THE WORDS ARE LEFT. Three separate spellings of the same
 * sentence were reported as three missing checks:
 *
 *   - the patch escapes its inner quotes (`\"My runs\"`) because it is inside a
 *     Python string; the suite does not;
 *   - the patch writes `'create a '` and the suite writes `"create a "`, so
 *     every quote character is DROPPED rather than folded to a sentinel: the
 *     suite often quotes a label INSIDE the sentence (`and "Find Blockers" now
 *     names …`) where the patch's claim does not, and a sentinel there breaks
 *     the match just as surely as the original character did;
 *   - the suite uses `’` where the patch uses `'`.
 *
 * None of those is a difference in what the check SAYS, and a checker that
 * reports them is just noise with a failure's exit code.
 */
const norm = (s) =>
  s
    .replace(/\\(["'\\])/g, '$1')
    .replace(/[\u2018\u2019\u02bc'"\u201c\u201d]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

/*
 * A CHECK SENTENCE IS OFTEN A TEMPLATE LITERAL, so its literal text is not in
 * the file: `the grid is four columns wide at ${VIEWPORT.width}px` cannot be
 * found by searching for "…at 1440px". The claim's leading fragment still can
 * be, and matching on it is the difference between a checker that finds rotted
 * claims and one that reports every interpolated sentence as rotted.
 */
const MIN_PREFIX = 24
const findsClaim = (hay, q) => {
  if (hay.includes(q)) return true
  for (let n = q.length - 1; n >= MIN_PREFIX; n--) {
    if (hay.includes(q.slice(0, n))) return true
  }
  return false
}

/** The `Reddens:` block: the line itself plus any `#` lines that continue it. */
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
const noClaim = []
const noSuite = []
const notFound = []
let unverifiable = 0
let ok = 0

for (const f of files) {
  const name = f.slice(0, -3)
  const block = reddensBlock(readFileSync(join(BREAKS, f), 'utf8').split('\n'))
  if (!block) {
    noClaim.push(name)
    continue
  }
  // `unit:` claims point at a *.test.ts, which this does not try to parse.
  if (/^unit\b/i.test(block.trim())) {
    unverifiable++
    continue
  }
  // Quoted sentences, tolerating a `\"` inside one.
  const quoted = [...block.matchAll(/"((?:[^"\\]|\\.){8,}?)"/g)].map((m) => norm(m[1]))
  if (quoted.length === 0) {
    unverifiable++
    continue
  }
  const named = (block.match(/^([a-z0-9][a-z0-9-]*)\s*:/i) || [])[1]
  const suite =
    (named && existsSync(join(SUITES, `${named}.mjs`)) && named) || prefixSuite(name) || null

  if (suite) {
    const hay = hayFor(suite)
    const missing = quoted.filter((q) => !findsClaim(hay, q))
    if (missing.length) notFound.push([name, suite, missing])
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
for (const [name, , missing] of noSuite) {
  console.log(`CLAIM IN NO SUITE   ${name}`)
  console.log(`                    names no suite, and no suite anywhere contains:`)
  for (const m of missing) console.log(`                      "${m}"`)
}

console.log(
  `\n[break-claims] ${ok} verified · ${unverifiable} unverifiable (unit claims, or no quoted ` +
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
 * A RATCHET, NOT A VERDICT.
 *
 * 36 patches quote a sentence their suite does not have and 121 quote nothing
 * at all. Some of that is real rot — `teams-empty-state-1` named a check that
 * had been deleted — and some is a patch paraphrasing where it should have
 * quoted (`"laid out as two rows of four"` against the suite's `and lays the
 * eight tiles out as two rows of four`). Both are worth fixing and neither is
 * fixable in one sitting.
 *
 * The two obvious ways to register a check in that state are both bad in ways
 * this audit has names for. Failing on arrival makes a red build the normal
 * state, and a check everybody steps over is worse than none. Exiting 0 with
 * the findings printed is a check that cannot fail.
 *
 * So it fails when a number GROWS. It cannot rot further — a refactor that
 * orphans another claim, or a new patch that makes none, fails the build that
 * brings it — and the baseline is a number in the file that only goes down.
 */
const BASELINE = { notFound: 35, noSuite: 1, noClaim: 121 }
const actual = { notFound: notFound.length, noSuite: noSuite.length, noClaim: noClaim.length }
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
