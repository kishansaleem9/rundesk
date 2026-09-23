#!/usr/bin/env node
/*
 * EVERY E2E SUITE HAS A CI STEP, OR A WRITTEN REASON WHY NOT.
 *
 * A suite that is not registered is verified once, on a lane, and then never
 * again: nothing notices when the product drifts under it. `doc-import.mjs`
 * was in that state — green on a lane (f634982), four break patches, the
 * Importers row closed on its evidence — and absent from ci.yml, while the
 * resume doc said every suite was registered. Nothing compared the directory
 * with the workflow, so the claim could not be checked except by hand.
 *
 * WHAT IT READS: every `test/e2e/*.mjs` (the suites; helpers live in `lib/`
 * and patches in `breaks/`), and the `run:` lines of `.github/workflows/ci.yml`
 * through `lib/suite-registration.mjs`, which explains why a grep over the
 * whole file would count suites that nothing runs.
 *
 * A SUITE MAY BE LEFT OUT, BY NAME AND WITH A REASON, in `NOT_IN_CI` below.
 * An entry that is registered after all, or names no suite, fails too: a
 * reason that no longer describes anything is the stale-reason defect.
 *
 * EMPTY IS A FAILURE, NOT A PASS. No suite directory, no suites in it, no
 * workflow, or a workflow that runs no suite at all: each would otherwise
 * report "every suite is registered" about nothing.
 *
 *   node scripts/check-suites-registered.mjs
 *
 * `REGISTRATION_ROOT` points it at another tree and `REGISTRATION_UNDER_TEST`
 * at another copy of the reader — both for `check-suites-registered-cases.mjs`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.REGISTRATION_ROOT ?? join(HERE, '..')
const READER = process.env.REGISTRATION_UNDER_TEST ?? join(HERE, 'lib', 'suite-registration.mjs')
const { registeredSuites } = await import(pathToFileURL(READER).href)

/** Suites deliberately not run by CI: name → why. Empty, and it should stay rare. */
const NOT_IN_CI = new Map([])

const SUITES_DIR = join(ROOT, 'test', 'e2e')
const CI_FILE = join(ROOT, '.github', 'workflows', 'ci.yml')

const problems = []
if (!existsSync(SUITES_DIR)) problems.push(`there is no suite directory at ${SUITES_DIR}`)
if (!existsSync(CI_FILE)) problems.push(`there is no workflow at ${CI_FILE}`)

const suites = existsSync(SUITES_DIR)
  ? readdirSync(SUITES_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.mjs'))
      .map((e) => e.name.slice(0, -'.mjs'.length))
      .sort()
  : []
const registered = existsSync(CI_FILE) ? registeredSuites(readFileSync(CI_FILE, 'utf8')) : new Set()

if (existsSync(SUITES_DIR) && suites.length === 0) problems.push('the suite directory holds no suites')
if (existsSync(CI_FILE) && registered.size === 0) {
  problems.push('ci.yml runs no suite at all — either nothing is registered or the reader found no `run:` lines')
}

const missing = suites.filter((s) => !registered.has(s) && !NOT_IN_CI.has(s))
for (const s of missing) {
  problems.push(`${s}.mjs has no CI step — add one to the postgres-harnesses job, or list it in NOT_IN_CI with the reason`)
}
for (const [s] of NOT_IN_CI) {
  if (!suites.includes(s)) problems.push(`NOT_IN_CI names ${s}, which is not a suite`)
  else if (registered.has(s)) problems.push(`NOT_IN_CI excuses ${s}, which ci.yml runs — the reason is stale`)
}

if (problems.length > 0) {
  console.log('\x1b[31mnot ok\x1b[0m suites and CI disagree:')
  for (const p of problems) console.log(`  · ${p}`)
  process.exitCode = 1
} else {
  console.log(
    `\x1b[32mok\x1b[0m ${suites.length} suite(s), ${suites.length - NOT_IN_CI.size} run by ci.yml` +
      (NOT_IN_CI.size > 0 ? `, ${NOT_IN_CI.size} excused by name` : ''),
  )
}
