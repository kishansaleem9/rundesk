#!/usr/bin/env node
/**
 * How many suites have ever had a break patch written for them at all.
 *
 * THE AUDIT HAS BEEN REPORTING "N break-tested" PER ROW AND NEVER THE
 * DENOMINATOR. Counted for the first time on 21 September: 101 suites carry
 * 1961 checks between them, 509 patches were attributable to a suite, and
 * **53 suites had no break patch at all** — including the largest ones in the
 * repository: `video-regression` (81 checks), `custom-field-progress` (58),
 * `task-menu` (33), `comment-recording` (32), `a61-meeting-record` (28),
 * `task-merge` and `list-export` (25 each).
 *
 * `task-menu` and `custom-field-progress` are closed, so the ratchet stands at
 * 51. The count this file prints is always the current one; the paragraph above
 * is what it was when anybody first looked.
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
 * Registered as a ratchet: the count of uncovered suites may fall and may not
 * rise, so a new suite arrives with a patch or fails the build that brings it.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SUITES = join(ROOT, 'test/e2e')
const BREAKS = join(ROOT, 'test/e2e/breaks')

const suiteNames = readdirSync(SUITES)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => f.slice(0, -4))

const checksIn = {}
for (const n of suiteNames) {
  checksIn[n] = (readFileSync(join(SUITES, `${n}.mjs`), 'utf8').match(/\bchk\(/g) || []).length
}

// A patch belongs to the suite its header names, else to the longest prefix of
// its filename that is a suite — the same resolution `check-break-claims.mjs`
// uses, and the same one a person reading the directory would use.
const prefixSuite = (name) => {
  const p = name.split('-')
  for (let i = p.length; i > 0; i--) {
    const c = p.slice(0, i).join('-')
    if (existsSync(join(SUITES, `${c}.mjs`))) return c
  }
  return null
}

const patches = {}
let unattributed = 0
for (const f of readdirSync(BREAKS).filter((x) => x.endsWith('.py'))) {
  const text = readFileSync(join(BREAKS, f), 'utf8')
  const named = (text.match(/^#\s*Reddens:\s*([a-z0-9][a-z0-9-]*)\s*:/im) || [])[1]
  const suite =
    (named && existsSync(join(SUITES, `${named}.mjs`)) && named) || prefixSuite(f.slice(0, -3))
  if (suite) patches[suite] = (patches[suite] ?? 0) + 1
  else unattributed++
}

const withChecks = suiteNames.filter((n) => checksIn[n] > 0)
const uncovered = withChecks.filter((n) => !patches[n]).sort((a, b) => checksIn[b] - checksIn[a])
const totalChecks = withChecks.reduce((a, n) => a + checksIn[n], 0)
const totalPatches = Object.values(patches).reduce((a, b) => a + b, 0)

console.log(
  `[break-coverage] ${withChecks.length} suites · ${totalChecks} checks · ${totalPatches} patches ` +
    `attributed (${unattributed} could not be attributed to a suite)`,
)
console.log(`[break-coverage] ${uncovered.length} suites have NO break patch at all:`)
for (const n of uncovered) console.log(`    ${String(checksIn[n]).padStart(3)} checks  ${n}`)

// THE RATCHET. Lower it when a suite is covered; never raise it to pass.
const BASELINE_UNCOVERED = 51
if (uncovered.length > BASELINE_UNCOVERED) {
  console.error(
    `\n[break-coverage] WORSE: ${BASELINE_UNCOVERED} → ${uncovered.length} suites with no break patch.`,
  )
  console.error('  A new suite arrives with a patch, or this build fails. Do not raise the baseline.')
  process.exit(1)
}
if (uncovered.length < BASELINE_UNCOVERED) {
  console.log(`\n[break-coverage] better — lower the baseline in this file to ${uncovered.length}`)
}
process.exit(0)
