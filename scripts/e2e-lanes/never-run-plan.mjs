#!/usr/bin/env node
/*
 * WHAT IS LEFT TO MEASURE, as a list `run-plan.sh` can be fed.
 *
 * `check-break-freshness.mjs` answers "is there a log?" and prints a count per
 * suite. A count is the right thing for a check and the wrong thing for doing
 * the work: acting on it means opening 283 patch files by hand to find out
 * which ones the count was about. So this prints the same set of patches, named
 * and grouped by the suite they aim at:
 *
 *     ai-answer-rendering aar-1-... aar-2-... aar-3-...
 *
 * ONE LINE PER SUITE, PATCHES IN THEIR OWN ORDER, and each line is exactly the
 * arguments `wt-break.sh <lane>` takes. Attribution is the freshness checker's
 * — the first `# Reddens:` line, requiring the named suite to exist as a file —
 * because two answers to "whose patch is this?" is the duplicated list this
 * audit keeps finding, and the number printed here has to be the number printed
 * there.
 *
 * ONLY THE PATCHES WITH NO LOG. A set whose other patches were measured and
 * archived does not need re-measuring to prove those; `wt-break.sh` truncates
 * the canonical log per run, and the per-run archive keeps what came before.
 * Re-running a measured patch costs a full suite run to reprint a number that
 * is already on disk.
 *
 * AND `--drifted` IS THE OTHER HALF OF THE SAME QUESTION. A patch measured
 * against a tree that has since changed under it is in the same position as one
 * with no log at all: the number on disk is a statement about files that have
 * moved, which is `check-break-freshness.mjs`'s whole premise. Making seventy
 * suites print their check's sentence on failure put seventy-one sets in that
 * state at once, so the work needed a list rather than a count.
 *
 * This was `--stale`, and it asked the question by the CLOCK: the suite file's
 * last commit against the canonical log's mtime. Two ways that reads wrong, both
 * of which cost me the measurement I most needed — a suite fix committed while
 * its own set was still running looks newer than the suite, and a green fixed in
 * the PRODUCT never touches the suite file at all. `scripts/lib/log-tree.mjs`
 * carries the reckoning; the short of it is that the log names the commit it
 * measured, so nothing here has to be inferred from a timestamp.
 *
 * The two modes do not overlap: `--drifted` takes patches whose newest log is
 * about a tree that has since changed in the suite or in the product files the
 * patch edits; the default takes patches with no log anywhere, whatever the age
 * of the tree around them.
 *
 *   node scripts/e2e-lanes/never-run-plan.mjs            # unmeasured, largest first
 *   node scripts/e2e-lanes/never-run-plan.mjs --drifted  # measured against a tree that moved
 *   node scripts/e2e-lanes/never-run-plan.mjs --max 6    # only sets of 6 or fewer
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeSuiteOf } from '../lib/suite-of-patch.mjs'
import { measuredAt, patchDeps, makeMeasurementCheck } from '../lib/log-tree.mjs'

const ROOT = new URL('../..', import.meta.url).pathname
const LOGS = '/tmp/claude-0'
const BREAKS = join(ROOT, 'test/e2e/breaks')
const maxAt = process.argv.indexOf('--max')
const MAX = maxAt === -1 ? Infinity : Number(process.argv[maxAt + 1])
const DRIFTED = process.argv.includes('--drifted')

// Every patch name that appears as a `== <name>` line in any log, archives
// included — the same scan freshness uses, for the same reason: patches are
// named after the feature, not the suite. `measuredAt` carries the sha each one
// was measured at, which is what `--drifted` reads.
const ran = measuredAt(LOGS)
// The SAME question `check-break-reddened.mjs` asks, from the same function:
// dependencies moved, the patch's own code changed, or a `# Re-run:` pending.
// This read `git diff` over the dependencies alone, so a patch whose body was
// rewritten stayed "current" here and "drifted" there — and a chain built on
// this plan could never clear what the checker kept reporting.
const notCurrent = makeMeasurementCheck({ root: ROOT })

const SUITES = join(ROOT, 'test/e2e')
const suiteOf = makeSuiteOf({
  suiteDir: SUITES,
  candidates: readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)),
})

const bySuite = new Map()
let nosha = 0
let declared = 0
for (const f of readdirSync(BREAKS).filter((f) => f.endsWith('.py')).sort()) {
  const name = f.slice(0, -3)
  const rec = ran.get(name)
  if (!DRIFTED && rec) continue
  const text = readFileSync(join(BREAKS, f), 'utf8')
  /*
   * A `unit:` CLAIM IS ASKED FOR BY NAME, NOT INFERRED FROM `suiteOf`.
   *
   * The line below used to be the whole exclusion — `if (!suite) continue // a
   * unit: claim, or nothing that names a suite at all` — and it worked for
   * three of the four unit claims BY ACCIDENT OF NAMING. `ts-9-dedupe-dropped`,
   * `amp-2-opus-unpriced` and `aar-17-views-hardcoded` use abbreviated prefixes
   * that match no suite file, so `suiteOf` answered nothing and they fell out.
   * `planner-priorities-1-two-cache-keys-again` prefix-matches
   * `test/e2e/planner-priorities.mjs`, so `suiteOf`'s name fallback handed it a
   * suite and the plan scheduled it.
   *
   * An e2e run can never settle it. Its evidence is `use-priorities.test.ts`,
   * `check-unit-claims.mjs` measures it every preflight, and the per-suite log
   * for `planner-priorities` will never carry a verdict about a query key that
   * nothing in that suite is about. So every round asked for it again, and the
   * chain would have ended at "no progress, stopping" rather than at "nothing
   * left — every log on disk measured the current tree". The sweep's own
   * terminal sentence, unreachable, because of one patch's name.
   *
   * `check-plan-population.mjs` is what found it and is what keeps this and
   * `check-break-reddened.mjs` answering the same question the same way.
   */
  if (/^#\s*Reddens:\s*unit\b/im.test(text)) continue
  const suite = suiteOf(name, text)
  if (!suite) continue // nothing that names a suite at all
  if (DRIFTED) {
    if (!rec) continue // the default mode's business, not this one
    // A log from before `wt-break.sh` recorded what it synced to cannot be
    // placed in the history at all. UNKNOWN is not CURRENT, so it goes in the
    // work list and is counted out loud rather than passed over in silence.
    const why = notCurrent(rec, patchDeps(text, suite), { name, text })
    if (!why.length) continue
    if (!rec.sha) nosha++
    else if (why.some((w) => w.endsWith('<declares Re-run>'))) declared++
  }
  if (!bySuite.has(suite)) bySuite.set(suite, [])
  bySuite.get(suite).push(name)
}

const rows = [...bySuite].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
let patches = 0
for (const [suite, names] of rows) {
  if (names.length > MAX) continue
  patches += names.length
  console.log([suite, ...names].join(' '))
}
console.error(
  `[never-run-plan] ${patches} patch(es) across ${rows.filter((r) => r[1].length <= MAX).length} ` +
    `${DRIFTED ? 'DRIFTED' : 'unmeasured'} suite(s)${MAX === Infinity ? '' : ` of ${MAX} or fewer`}` +
    `${nosha ? `, ${nosha} of them from a log that never recorded its commit` : ''}` +
    `${declared ? `, ${declared} by a \`# Re-run:\` line in the patch` : ''}`,
)
