#!/usr/bin/env node
/*
 * THE REGISTRATION GATE, ON TREES BUILT TO FOOL IT.
 *
 * `check-suites-registered.mjs` gates, and its steady-state answer is "ok". A
 * gate whose only observed output is "ok" cannot be told apart from one that
 * reads nothing, which is the position every checker in `scripts/` has been
 * found in at least once. So each case plants a miniature tree — suites and a
 * workflow — and runs the real gate against it, and `--mutate` breaks the
 * reader and the gate one rule at a time and requires a case to notice.
 *
 * The cases are the ways a suite can LOOK registered and not be: named in a
 * comment, in a step's `name:`, behind a shell `#` inside a run block, or as
 * the tail of another suite's filename. And the ways the gate can pass on
 * nothing: no directory, no suites, no workflow.
 *
 *   node scripts/check-suites-registered-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = process.env.GATE_UNDER_TEST ?? join(HERE, 'check-suites-registered.mjs')
const READER = join(HERE, 'lib', 'suite-registration.mjs')

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

/** Plant `suites` and `ci` (null for none) in a throwaway tree and run the gate there. */
const plant = ({ suites = [], ci = null, noSuiteDir = false, gate = GATE }) => {
  const dir = mkdtempSync(join(tmpdir(), 'suites-registered-'))
  try {
    if (!noSuiteDir) mkdirSync(join(dir, 'test', 'e2e', 'lib'), { recursive: true })
    for (const s of suites) writeFileSync(join(dir, 'test', 'e2e', `${s}.mjs`), '// a suite\n')
    if (!noSuiteDir) writeFileSync(join(dir, 'test', 'e2e', 'lib', 'helper.mjs'), '// not a suite\n')
    if (ci !== null) {
      mkdirSync(join(dir, '.github', 'workflows'), { recursive: true })
      writeFileSync(join(dir, '.github', 'workflows', 'ci.yml'), ci)
    }
    const r = spawnSync(process.execPath, [gate], {
      encoding: 'utf8',
      cwd: tmpdir(),
      env: { ...process.env, REGISTRATION_ROOT: dir },
    })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const workflow = (steps) => `name: CI
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
${steps}
`

const INLINE = (s) => `      - name: ${s}\n        run: node test/e2e/${s}.mjs --api 3011\n`
const BLOCK = (s) => `      - name: ${s} in a block\n        run: |\n          echo starting\n          node test/e2e/${s}.mjs --api 3011\n`

console.log('\n▶ what registered looks like')
{
  const r = plant({ suites: ['alpha', 'beta'], ci: workflow(INLINE('alpha') + BLOCK('beta')) })
  chk(r.code === 0, 'suites run inline and inside a `run: |` block both count', `it exited ${r.code}: ${r.out.trim()}`)
  chk(/2 suite\(s\), 2 run by ci\.yml/.test(r.out), 'and it says how many it read', `it said ${JSON.stringify(r.out.trim())}`)
}
{
  const r = plant({ suites: ['alpha'], ci: workflow(`      - run: node test/e2e/alpha.mjs\n`) })
  chk(r.code === 0, 'a step that is only `- run:` counts too', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log('\n▶ the ways a suite can look registered and not be')
{
  const r = plant({ suites: ['alpha', 'beta'], ci: workflow(INLINE('alpha')) })
  chk(r.code === 1 && /beta\.mjs has no CI step/.test(r.out), 'a suite with no step fails the gate, by name', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ suites: ['alpha', 'beta'], ci: workflow(INLINE('alpha') + `      # node test/e2e/beta.mjs --api 3011\n`) })
  chk(r.code === 1 && /beta\.mjs has no CI step/.test(r.out), 'named only in a YAML comment is not registered', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  // After a block, so a reader that never ends its block swallows this name.
  const r = plant({
    suites: ['alpha', 'beta'],
    ci: workflow(BLOCK('alpha') + `      - name: node test/e2e/beta.mjs\n        run: echo nothing runs it\n`),
  })
  chk(r.code === 1 && /beta\.mjs has no CI step/.test(r.out), 'named only in a step’s `name:` is not registered', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({
    suites: ['alpha', 'beta'],
    ci: workflow(INLINE('alpha') + `      - run: |\n          # node test/e2e/beta.mjs\n          echo skipped\n`),
  })
  chk(r.code === 1 && /beta\.mjs has no CI step/.test(r.out), 'behind a shell `#` inside a run block is not registered', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ suites: ['task-cover', 'cover'], ci: workflow(INLINE('task-cover')) })
  // `· cover.mjs`, with the bullet: `\bcover\.mjs` also matches inside
  // `task-cover.mjs`, so a reader that registered the WRONG one would pass.
  chk(r.code === 1 && /· cover\.mjs has no CI step/.test(r.out), 'another suite’s filename ending in this one’s name does not register it', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log('\n▶ the ways it could pass on nothing')
{
  const r = plant({ noSuiteDir: true, ci: workflow(INLINE('alpha')) })
  chk(r.code === 1 && /no suite directory/.test(r.out), 'no suite directory is a failure', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ suites: [], ci: workflow(INLINE('alpha')) })
  chk(r.code === 1 && /holds no suites/.test(r.out), 'a suite directory with no suites — only helpers — is a failure', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ suites: ['alpha'], ci: null })
  chk(r.code === 1 && /no workflow/.test(r.out), 'no workflow is a failure', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ suites: ['alpha'], ci: workflow(`      - run: pnpm test\n`) })
  chk(r.code === 1 && /runs no suite at all/.test(r.out), 'a workflow that runs no suite is a failure, not a list of misses', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.REGISTRATION_UNDER_TEST && !process.env.GATE_UNDER_TEST) {
  const alive = (envVar) => (mutant) => {
    const r = spawnSync(process.execPath, [envVar === 'GATE_UNDER_TEST' ? mutant : GATE], {
      encoding: 'utf8',
      env: { ...process.env, [envVar]: mutant },
    })
    return { ok: /ok\b/.test(r.stdout ?? ''), why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: READER,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'REGISTRATION_UNDER_TEST',
    label: 'the reader',
    alive: alive('REGISTRATION_UNDER_TEST'),
    mutations: [
      ['comments-count', ".filter((l) => !l.trimStart().startsWith('#'))", '.filter(() => true)'],
      ['blocks-never-entered', 'if (!BLOCK_SCALAR.test(rest)) {', 'if (true) {'],
      ['blocks-never-end', 'if (l.length - l.trimStart().length <= indent.length) break', 'if (false) break'],
      ['whole-file-grep', 'for (const line of runLines(ciText)) {', "for (const line of ciText.split('\\n')) {"],
      ['tail-of-a-name', 'test\\/e2e\\/([A-Za-z0-9._-]+)\\.mjs', 'test\\/e2e\\/(?:[A-Za-z0-9._]*-)?([A-Za-z0-9._-]+?)\\.mjs'],
    ],
  })
  blind += proveMutationsBite({
    subject: GATE,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'GATE_UNDER_TEST',
    label: 'the gate',
    alive: alive('GATE_UNDER_TEST'),
    mutations: [
      ['misses-pass', 'process.exitCode = 1', 'process.exitCode = 0'],
      ['no-dir-skipped', 'if (!existsSync(SUITES_DIR)) problems.push', 'if (false) problems.push'],
      ['no-suites-pass', "if (existsSync(SUITES_DIR) && suites.length === 0) problems.push('the suite directory holds no suites')", ''],
      ['no-workflow-skipped', 'if (!existsSync(CI_FILE)) problems.push', 'if (false) problems.push'],
      ['runs-nothing-pass', 'if (existsSync(CI_FILE) && registered.size === 0) {', 'if (false) {'],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
