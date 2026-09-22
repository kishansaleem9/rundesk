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
 * its longest literal fragment (see `findsClaim`), because the interpolated
 * part is not in the file at all. A claim that cannot be checked either way
 * is counted as UNVERIFIABLE rather than as a failure — a check that says "I could not tell"
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
 * the file at all: `the grid is four columns wide at ${VIEWPORT.width}px`
 * cannot be found by searching for "…at 1440px". Matching on a literal fragment
 * instead is the difference between a checker that finds rotted claims and one
 * that reports every interpolated sentence as rotted.
 *
 * The fragment cannot be the claim's PREFIX, which is what this tried first:
 * the interpolation is often at the START — `<name> really exists in this run's
 * own space`, `every one of the ${n} tiles offered` — leaving a prefix far too
 * short to match on. So the longest contiguous fragment ANYWHERE in the
 * sentence is looked for, longest first.
 *
 * MEASURED IN WORDS, NOT CHARACTERS, and this is where the tuning stops. A
 * 30-character floor still failed `the type picker offers all ${n} field types`
 * and `the modal's picker offers all ${n} types`, whose literal runs are 27 and
 * 30 characters — so the floor was wrong, not the claims, and the obvious move
 * is to lower it. That way lies a matcher that matches anything, which is a
 * check that cannot fail.
 *
 * Five consecutive words is the rule instead, because it is a statement about
 * how specific the evidence is rather than a number picked to make today's
 * failures go away: five words of a check's own sentence do not appear by
 * accident in a different check.
 *
 * AND IT STILL MATCHES THE WRONG CHECK WHERE TWO DIFFER BY ONE WORD.
 * `mp-7-flat-bars` claimed "the Fast tier's Speed bar is visibly longer than
 * the DEEP tier's" and the suite compares Fast against MAX. The shared
 * fragment — "Speed bar is visibly longer than the" — is six words, so the
 * claim verified and the patch was aimed at a comparison that does not exist.
 * It ran green, correctly, and only running it told anyone.
 *
 * A FRAGMENT LONG ENOUGH NOT TO APPEAR BY ACCIDENT IS NOT THE SAME AS A
 * FRAGMENT THAT PINS THE MEANING. This is a real limit of matching on text and
 * not one to tune away: requiring the whole sentence would reject every
 * template literal, which is where this started. Where a suite holds two
 * checks of the same shape over different subjects, the claim can only be
 * confirmed by the run. What is left over after this is reported, and
 * some of it is a patch paraphrasing where it should have quoted — which is a
 * real defect in the patch, and not one the matcher should be bent to hide.
 */
const MIN_WORDS = 5
const findsClaim = (hay, q) => {
  if (hay.includes(q)) return true
  const w = q.split(' ')
  for (let len = w.length - 1; len >= MIN_WORDS; len--) {
    for (let i = 0; i + len <= w.length; i++) {
      if (hay.includes(w.slice(i, i + len).join(' '))) return true
    }
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
let crossSuite = 0
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
const BASELINE = { notFound: 16, noSuite: 1, noClaim: 28 }
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
