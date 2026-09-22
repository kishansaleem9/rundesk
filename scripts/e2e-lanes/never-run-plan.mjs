#!/usr/bin/env node
/*
 * WHAT IS LEFT TO MEASURE, as a list `break-queue.sh` can be fed.
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
 *   node scripts/e2e-lanes/never-run-plan.mjs            # every suite, largest first
 *   node scripts/e2e-lanes/never-run-plan.mjs --max 6    # only sets of 6 or fewer
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeSuiteOf } from '../lib/suite-of-patch.mjs'

const ROOT = new URL('../..', import.meta.url).pathname
const LOGS = '/tmp/claude-0'
const BREAKS = join(ROOT, 'test/e2e/breaks')
const maxAt = process.argv.indexOf('--max')
const MAX = maxAt === -1 ? Infinity : Number(process.argv[maxAt + 1])

// Every patch name that appears as a `== <name>` line in any log, archives
// included — the same scan freshness uses, for the same reason: patches are
// named after the feature, not the suite.
const everRun = new Set()
for (const f of readdirSync(LOGS).filter((f) => /^break-.+\.txt$/.test(f))) {
  for (const line of readFileSync(join(LOGS, f), 'utf8').split('\n')) {
    const m = line.match(/^== ([a-z0-9][a-z0-9-]*)\b/)
    if (m) everRun.add(m[1])
  }
}

const SUITES = join(ROOT, 'test/e2e')
const suiteOf = makeSuiteOf({
  suiteDir: SUITES,
  candidates: readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)),
})

const bySuite = new Map()
for (const f of readdirSync(BREAKS).filter((f) => f.endsWith('.py')).sort()) {
  const name = f.slice(0, -3)
  if (everRun.has(name)) continue
  const text = readFileSync(join(BREAKS, f), 'utf8')
  const suite = suiteOf(name, text)
  if (!suite) continue // a `unit:` claim, or nothing that names a suite at all
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
    `suite(s)${MAX === Infinity ? '' : ` of ${MAX} or fewer`}`,
)
