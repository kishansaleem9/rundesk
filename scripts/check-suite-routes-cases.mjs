#!/usr/bin/env node
/*
 * THE SERVICE-WORKER ROUTE GATE, ON PLANTED SUITES.
 *
 * Each case plants suites in a throwaway `test/e2e/` and runs the gate there:
 * a routing suite whose contexts block; one whose context says nothing (the
 * `webhook-access` shape); one that says 'allow' on purpose; options held in a
 * variable; a `.route(` only in a comment; `browser.newPage` with no options;
 * a suite that routes nothing; an empty tree. `--mutate` breaks the gate one
 * rule at a time.
 *
 *   node scripts/check-suite-routes-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = process.env.GATE_UNDER_TEST ?? join(HERE, 'check-suite-routes.mjs')

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

const plant = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'suite-routes-'))
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', cwd: tmpdir(), env: { ...process.env, SUITE_ROUTES_ROOT: dir } })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const BLOCKING = [
  "const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })",
  "await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, body: '[]' }))",
].join('\n') + '\n'
const SILENT = [
  'const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })',
  "await ctx.route('**/webhooks', (r) => r.abort())",
].join('\n') + '\n'
const tree = (over = {}) => ({ 'test/e2e/held.mjs': BLOCKING, 'test/e2e/plain.mjs': 'await page.goto("/")\n', ...over })

console.log('\n▶ what the gate lets be')
{
  const r = plant(tree())
  chk(r.code === 0 && /ok — 1 suite\(s\) route requests; each of their 1 context/.test(r.out), 'a routing suite whose context blocks the worker: ok, and counted', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'test/e2e/kept.mjs': "const ctx = await browser.newContext({ serviceWorkers: 'allow' })\nawait ctx.route('**/api/**', (r) => r.continue())\n" }))
  chk(r.code === 0, "a context that says 'allow' on purpose is a decision, not silence", `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'test/e2e/opts.mjs': "const OPTS = { viewport: VIEWPORT, serviceWorkers: 'block' }\nconst ctx = await browser.newContext(OPTS)\nawait page.route('**/x', (r) => r.abort())\n" }))
  chk(r.code === 0, 'options held in a variable are followed to their object', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'test/e2e/commented.mjs': "const ctx = await browser.newContext({})\n// await ctx.route('**/x', (r) => r.abort())\n" }))
  chk(r.code === 0, 'a `.route(` in a comment routes nothing', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log('\n▶ what the gate must find')
{
  const r = plant(tree({ 'test/e2e/webhook-access.mjs': SILENT }))
  chk(r.code === 1 && /webhook-access\.mjs:1 opens a context that does not say serviceWorkers/.test(r.out), 'a routing suite whose context says nothing about the worker is a failure, named with its line', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'test/e2e/two.mjs': `${BLOCKING}const other = await browser.newContext({ viewport: { width: 800, height: 600 } })\n` }))
  chk(r.code === 1 && /two\.mjs:3 /.test(r.out), 'every context of a routing suite is read, not only the first', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'test/e2e/bare.mjs': "const page = await browser.newPage()\nawait page.route('**/api/**', (r) => r.abort())\n" }))
  chk(r.code === 1 && /bare\.mjs:1 /.test(r.out), '`browser.newPage()` with no options is a context too', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'test/e2e/lib/helper.mjs': SILENT }))
  chk(r.code === 1 && /lib\/helper\.mjs:1 /.test(r.out), 'a helper under lib/ is read too', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'test/e2e/opts.mjs': "const OPTS = { viewport: VIEWPORT }\nconst ctx = await browser.newContext(OPTS)\nawait page.route('**/x', (r) => r.abort())\n" }))
  chk(r.code === 1 && /opts\.mjs:2 /.test(r.out), 'options in a variable that say nothing are a failure too', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ 'test/e2e/plain.mjs': 'await page.goto("/")\n' })
  chk(r.code === 1 && /no suite routes a request/.test(r.out), 'a tree where nothing routes is a failure, not a pass', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ 'README.md': 'nothing\n' })
  chk(r.code === 1 && /no suite was read/.test(r.out), 'no suites at all is a failure, not a pass', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.GATE_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8' })
    return { ok: /ok\b|✗/.test(`${r.stdout ?? ''}`), why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: GATE,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'GATE_UNDER_TEST',
    label: 'the gate',
    alive,
    mutations: [
      ['misses-pass', '  process.exitCode = 1\n', '  process.exitCode = 0\n'],
      ['silence-passes', "const BLOCKS = /serviceWorkers\\s*:\\s*['\"](block|allow)['\"]/", 'const BLOCKS = /./'],
      ['comments-count', "  const code = stripComments(readFileSync(file, 'utf8'))\n", "  const code = readFileSync(file, 'utf8')\n"],
      ['first-only', '    if (!ok) {\n      const line', '    if (!ok && opened === 1) {\n      const line'],
      ['no-newpage', '(?:newContext|browser\\.newPage)\\(', '(?:newContext)\\('],
      ['no-lib', "const DIRS = [join(ROOT, 'test', 'e2e'), join(ROOT, 'test', 'e2e', 'lib')]", "const DIRS = [join(ROOT, 'test', 'e2e')]"],
      ['no-follow', '    if (!ok && /^[A-Za-z_$][\\w$]*$/.test(args)) {', '    if (false) {'],
      ['nothing-routes-passes', "else if (routing === 0) problems.push(", 'else if (false) problems.push('],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
