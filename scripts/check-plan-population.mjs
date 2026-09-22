#!/usr/bin/env node
/*
 * THE PLAN ASKS FOR EXACTLY WHAT IS NOT MEASURED — and nothing was checking it.
 *
 * The sweep's end state is one sentence, printed by `chain-plan.sh`:
 *
 *     round N: nothing left — every log on disk measured the current tree
 *
 * Everything in this audit is aimed at earning it. And it is produced by
 * `never-run-plan.mjs` returning no lines, while the number anyone would quote
 * it against — "0 unproven, 0 green, N reddened" — comes from
 * `check-break-reddened.mjs`. TWO INSTRUMENTS, ONE QUESTION: has this patch
 * been measured against this tree?
 *
 * They disagreed. Measured 22 September: the plan listed 598 patches to run and
 * the reddened checker put 597 in the two buckets that need one. Four patches —
 * `teams-carousel-1` through `-4` — had `brk-<patch>.log` files from 21
 * September at 20:55 and no line in any per-suite log, ever. The reddened
 * checker asked `existsSync(brk-…)` FIRST, found one, fell through to the drift
 * check, and a missing per-suite record came back as `<no run log>` — filing
 * them under "measured against a tree that has moved". The plan read the
 * per-suite logs and called them unmeasured. Both numbers were defensible and
 * one of them was wrong.
 *
 * That is the duplicated list, in the instruments rather than in the product,
 * and it is the worst place for it: a plan that keeps asking for patches the
 * other tool counts as done never reaches "nothing left" — it reaches "no
 * progress, stopping" — and a patch the plan never schedules while the checker
 * treats it as unmeasured stays unmeasured forever behind a victory sentence.
 *
 * SO THIS COMPARES THE TOOLS' OUTPUT, NOT THEIR LIBRARIES. Both read
 * `scripts/lib/log-tree.mjs`; re-deriving the answer here would agree with
 * itself by construction and prove nothing. It runs both, parses what they
 * print, and requires the two sets to be equal PATCH FOR PATCH, naming every
 * member of the difference in both directions.
 *
 * PREFLIGHT ONLY, NOT CI, for the reason `check-break-reddened.mjs` gives about
 * itself: both instruments read `/tmp/claude-0`, so in CI they would each find
 * nothing, agree perfectly, and this would exit 0 — a check that cannot fail
 * dressed as a passing one.
 *
 *   node scripts/check-plan-population.mjs
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BREAKS = join(ROOT, 'test/e2e/breaks')

const run = (script, args = [], env = {}) => {
  const r = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, ...env },
  })
  return (r.stdout ?? '') + (r.stderr ?? '')
}

/* The plan's lines are `<suite> <patch> <patch> …`; the first field is a suite. */
const planSet = (out) => {
  const set = new Set()
  for (const line of out.split('\n')) {
    if (!line.trim() || line.startsWith('[')) continue
    for (const p of line.trim().split(/\s+/).slice(1)) set.add(p)
  }
  return set
}

const onDisk = new Set(
  readdirSync(BREAKS).filter((f) => f.endsWith('.py')).map((f) => f.slice(0, -3)),
)

const planNeverRun = planSet(run('scripts/e2e-lanes/never-run-plan.mjs'))
const planDrifted = planSet(run('scripts/e2e-lanes/never-run-plan.mjs', ['--drifted']))
const plan = new Set([...planNeverRun, ...planDrifted])

const buckets = {}
for (const line of run('scripts/check-break-reddened.mjs', [], { NAMES: '1' }).split('\n')) {
  const m = line.match(/^NAME (\S+) (\S+)$/)
  if (!m) continue
  ;(buckets[m[1]] ??= new Set()).add(m[2])
}

/*
 * WHICH BUCKETS NEED A RUN, and the two that look like they should and do not.
 *
 *   · `drifted` and `unknown` need one: there is no usable measurement of this
 *     tree for them, which is precisely what the plan is for.
 *   · `green` does NOT. A green has a current measurement — it says the patch
 *     reddened nothing — and running it again reproduces the same green. It
 *     needs a re-aim, or a fixture that can tell the difference, which is work
 *     for a person and not for the chain.
 *   · `unitClaim` does not either: its evidence is a `*.test.ts` and
 *     `check-unit-claims.mjs` measures all four every preflight.
 *   · `noClaim` needs a claim written before a run could mean anything.
 *
 * `unproven` is the awkward one and it belongs with the first group: the run
 * reported failures and could not say whether the claimed check was among them,
 * so nothing is known about THIS patch and a re-run against a tree where the
 * suite names its failures is exactly the fix.
 */
const NEEDS_RUN = ['drifted', 'unknown', 'unproven']
const needsRun = new Set(NEEDS_RUN.flatMap((b) => [...(buckets[b] ?? [])]))

const bucketed = new Set(Object.values(buckets).flatMap((s) => [...s]))
let bad = 0

// FIRST, THAT BOTH TOOLS SAW EVERY PATCH. A set comparison between two
// instruments that each dropped the same patch would come back equal.
if (bucketed.size !== onDisk.size) {
  const missing = [...onDisk].filter((p) => !bucketed.has(p))
  const extra = [...bucketed].filter((p) => !onDisk.has(p))
  console.error(
    `\n[plan-population] the reddened checker bucketed ${bucketed.size} patch(es) against ` +
      `${onDisk.size} on disk.`,
  )
  for (const p of missing.slice(0, 20)) console.error(`  never bucketed: ${p}`)
  for (const p of extra.slice(0, 20)) console.error(`  bucketed but not on disk: ${p}`)
  bad += 1
}

const planOnly = [...plan].filter((p) => !needsRun.has(p)).sort()
const checkerOnly = [...needsRun].filter((p) => !plan.has(p)).sort()

if (planOnly.length) {
  console.error(
    `\n[plan-population] ${planOnly.length} patch(es) the PLAN would run that the reddened ` +
      'checker counts as settled:',
  )
  for (const p of planOnly) {
    const where = Object.entries(buckets).find(([, s]) => s.has(p))?.[0] ?? '(unbucketed)'
    console.error(`  ${p} — the checker has it under \`${where}\``)
  }
  console.error(
    '\n  Every round will ask for these again and the run will not change the checker\'s answer,\n' +
      '  so the chain ends at "no progress, stopping" rather than at "nothing left".',
  )
  bad += 1
}

if (checkerOnly.length) {
  console.error(
    `\n[plan-population] ${checkerOnly.length} patch(es) the reddened checker says need a run ` +
      'and the PLAN does not list:',
  )
  for (const p of checkerOnly) {
    const where = Object.entries(buckets).find(([, s]) => s.has(p))?.[0] ?? '(unbucketed)'
    console.error(`  ${p} — the checker has it under \`${where}\``)
  }
  console.error(
    '\n  These stay unmeasured however long the chain runs, behind a round that reports nothing\n' +
      '  left to do. This is the direction that turns the sweep\'s final sentence into a false one.',
  )
  bad += 1
}

/*
 * AND THE UNION IS NOT ENOUGH, which this check learnt from its own first pass.
 *
 * `teams-carousel-1` through `-4` had `brk-` logs from 21 September and no line
 * in any per-suite log. The plan called them NEVER RUN; the reddened checker
 * called them MEASURED AGAINST A TREE THAT HAS MOVED. Both buckets mean "needs
 * a run", so the union agreed and the comparison above saw nothing — the
 * disagreement was found by hand, by reading the two tools' sub-counts, which
 * is exactly the reconciliation-by-reading this audit exists to replace.
 *
 * "Never run" and "measured against a tree that has since changed" are
 * contradictory claims about one patch. One of them is false, and which one
 * matters: a patch with no measurement has no tree to have drifted from, and
 * calling it drifted dresses an absence as a number that merely needs
 * repeating.
 */
const bothWays = [...planNeverRun].filter((p) => (buckets.drifted ?? new Set()).has(p)).sort()
if (bothWays.length) {
  console.error(
    `\n[plan-population] ${bothWays.length} patch(es) the plan calls NEVER RUN while the reddened ` +
      'checker calls them MEASURED against a tree that moved:',
  )
  for (const p of bothWays) console.error(`  ${p}`)
  console.error(
    '\n  Both buckets mean "needs a run", so the set comparison above cannot see this — and one of\n' +
      '  the two statements is false. A patch with no measurement has no tree to have drifted from.',
  )
  bad += 1
}

if (bad) {
  console.error(
    '\n[plan-population] The two instruments answer one question — has this patch been measured\n' +
      'against this tree — and they have to answer it the same way. Fix whichever is wrong; do not\n' +
      'widen this check to accommodate the gap.',
  )
  process.exitCode = 1
}

console.log(
  `[plan-population] the plan and the reddened checker agree on all ${needsRun.size} patch(es) ` +
    `needing a run, out of ${onDisk.size} on disk ` +
    `(${NEEDS_RUN.map((b) => `${b} ${(buckets[b] ?? new Set()).size}`).join(', ')})`,
)
