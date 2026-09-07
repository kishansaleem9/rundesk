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

/**
 * What was actually under test, by CONTENT.
 *
 * The first version of this hashed `HEAD` plus the count of dirty files, which
 * is git STATE and only a proxy for file content — and the two come apart in
 * the most ordinary way there is. Committing during a sweep changes HEAD and
 * empties the dirty count while touching not one byte of the working tree, so
 * the guard cried wolf on a run whose subject had never changed. A guard that
 * fires when nothing is wrong gets ignored, and then it is not a guard.
 *
 * Tracked and untracked-but-not-ignored files, hashed. `git commit` is
 * invisible to it; a real edit is not.
 *
 * SORTED, and that is not cosmetic. `git ls-files -co` lists cached files and
 * others in separate passes, so committing an untracked file moves it between
 * them and changes the ORDER without changing a byte. The unsorted version of
 * this fired on exactly that — the second false alarm from the same guard, for
 * a different reason than the first.
 */
function fingerprint() {
  const content = execFileSync(
    'bash',
    ['-c', "git ls-files -co --exclude-standard -z | sort -z | xargs -0 sha1sum | sha1sum | cut -c1-12"],
    { cwd: ROOT },
  ).toString().trim()
  const suites = fs.readdirSync(path.join(ROOT, 'test/e2e')).filter((f) => f.endsWith('.mjs')).length
  const migrations = fs.readdirSync(path.join(ROOT, 'packages/db/src/migrations')).filter((f) => f.endsWith('.sql')).length
  return `tree ${content} | ${suites} suites | ${migrations} migrations`
}

/**
 * The suites the workflow runs, in order, WITH the environment each is given.
 *
 * THE `env:` BLOCK IS NOT OPTIONAL DETAIL. Three suites default to
 * `verify@rundesk.internal`, a production account no seeded database has, and
 * ci.yml overrides them to the seeded admin in a per-step `env:`. The first
 * version of this parser read only the `run:` line, so those three signed in as
 * nobody and failed 401 — three red suites that were green in CI, for a reason
 * that had nothing to do with the code. A sweep that goes red on its own
 * plumbing is a sweep people stop reading.
 *
 * Parsed rather than imported because the workflow is YAML and the only things
 * needed from it are the command and its environment, both of which are already
 * written there exactly as they should be run.
 */
function suitesFromWorkflow() {
  const lines = fs.readFileSync(WORKFLOW, 'utf8').split('\n')
  const found = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)run:\s*(node\s+test\/e2e\/([\w.-]+)\.mjs.*)$/)
    if (!m) continue
    const [, indent, command, name] = m
    // An `env:` mapping belonging to this step sits at the same indent as
    // `run:`, with its keys indented deeper. Anything at or left of `run:`'s
    // indent that is not `env:` ends the step.
    const env = {}
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (!line.trim()) continue
      const lead = line.match(/^\s*/)[0].length
      if (lead <= indent.length && line.trim() !== 'env:') break
      if (line.trim() === 'env:') continue
      const kv = line.match(/^\s+([A-Z_][A-Z0-9_]*):\s*(.*)$/)
      if (!kv) break
      env[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '')
    }
    found.push({ name, command: command.trim(), env })
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
    env: { ...process.env, E2E_API_PORT: API_PORT, ...suite.env },
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
