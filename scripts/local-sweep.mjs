#!/usr/bin/env node
/**
 * Every browser suite CI runs, run here, before the push.
 *
 * WHY THIS EXISTS. GitHub Actions minutes are finite and a full run costs about
 * 33 of them, so a red push is expensive twice: the run that failed and the run
 * that fixes it. `scripts/preflight.sh` covers the "Verify Monorepo" job — lint,
 * typecheck, unit tests, the migration guard. This covers the other two jobs,
 * which is where the slow, real failures live.
 *
 * THE SUITE LIST IS DERIVED FROM `ci.yml`, NOT KEPT HERE. A hand-maintained
 * copy of it silently stops covering whatever was added last, which is exactly
 * the suite most likely to be broken. Everything in the workflow that runs a
 * `test/e2e/*.mjs` file is run, in the workflow's order.
 *
 * IT FINGERPRINTS BOTH ENDS. `HEAD | suite count | migration count` is printed
 * before and after. A sweep that started on one commit and finished on another —
 * because something was edited while it ran — describes neither, and a green
 * summary from such a run is worse than no run at all.
 *
 *   node scripts/local-sweep.mjs                 # everything
 *   node scripts/local-sweep.mjs comment planner # only suites matching these
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW = path.join(ROOT, '.github/workflows/ci.yml')
const DIST = path.join(ROOT, 'apps/web/dist')
const API_PORT = process.env.E2E_API_PORT ?? '3011'

const filters = process.argv.slice(2)

function fingerprint() {
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim()
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).length
  const suites = fs.readdirSync(path.join(ROOT, 'test/e2e')).filter((f) => f.endsWith('.mjs')).length
  const migrations = fs.readdirSync(path.join(ROOT, 'packages/db/src/migrations')).filter((f) => f.endsWith('.sql')).length
  return `${head}${dirty ? `+${dirty}` : ''} | ${suites} suites | ${migrations} migrations`
}

/**
 * The `run:` lines of the workflow that invoke a suite, in order.
 *
 * Parsed rather than imported because the workflow is YAML and the only thing
 * needed from it is the command line, which is already exactly what to run.
 */
function suitesFromWorkflow() {
  const lines = fs.readFileSync(WORKFLOW, 'utf8').split('\n')
  const found = []
  for (const line of lines) {
    const m = line.match(/run:\s*(node\s+test\/e2e\/([\w.-]+)\.mjs.*)$/)
    if (!m) continue
    found.push({ name: m[2], command: m[1].trim() })
  }
  // The same suite can appear twice in a workflow (different jobs / flags);
  // running it twice would double the wall clock for no extra coverage.
  const seen = new Set()
  return found.filter((s) => (seen.has(s.command) ? false : (seen.add(s.command), true)))
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  // A missing bundle makes every suite fail with ENOENT, which reads as
  // twenty broken features instead of one forgotten build.
  console.error(`✗ ${DIST}/index.html does not exist — build the web app first:\n    pnpm --filter @rundesk/web exec vite build`)
  process.exit(2)
}

const before = fingerprint()
const all = suitesFromWorkflow()
const suites = filters.length ? all.filter((s) => filters.some((f) => s.name.includes(f))) : all
if (suites.length === 0) {
  console.error(`✗ nothing matched ${JSON.stringify(filters)} in ${all.length} suites`)
  process.exit(2)
}

console.log(`\n${before}`)
console.log(`running ${suites.length}${filters.length ? ` of ${all.length}` : ''} suites\n`)

const results = []
for (const suite of suites) {
  const started = Date.now()
  const run = spawnSync('bash', ['-c', suite.command], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, E2E_API_PORT: API_PORT },
    timeout: 10 * 60_000,
  })
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`
  const tally = out.match(/(\d+) passed, (\d+) failed/)
  const seconds = Math.round((Date.now() - started) / 1000)
  const ok = run.status === 0
  results.push({
    name: suite.name,
    ok,
    seconds,
    passed: tally ? Number(tally[1]) : 0,
    failed: tally ? Number(tally[2]) : 0,
    // Kept so a failure can be read without re-running it.
    lines: ok ? [] : out.split('\n').filter((l) => /FAIL|Error|✗/.test(l)).slice(0, 12),
  })
  const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`${mark} ${suite.name.padEnd(28)} ${tally ? `${tally[1]}/${Number(tally[1]) + Number(tally[2])}` : '—'.padEnd(6)} ${seconds}s`)
}

const failed = results.filter((r) => !r.ok)
const checks = results.reduce((n, r) => n + r.passed + r.failed, 0)
console.log(`\n${results.length} suites, ${checks} checks, ${failed.length} suites failed`)
for (const f of failed) {
  console.log(`\n\x1b[31m${f.name}\x1b[0m`)
  for (const line of f.lines) console.log(`  ${line}`)
}

const after = fingerprint()
console.log(`\nbefore: ${before}\nafter:  ${after}`)
if (before !== after) {
  console.log('\n✗ the tree changed while the sweep ran — this result describes neither commit.')
  process.exit(1)
}
process.exit(failed.length === 0 ? 0 : 1)
