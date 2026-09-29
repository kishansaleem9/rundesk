#!/usr/bin/env node
/*
 * A SUITE THAT STANDS ON THE ASSISTANT'S REFUSAL SAYS SO
 * (`harness/model-lane-routing-unbuilt`).
 *
 * The lanes can run with a model (`RUNDESK_LANE_MODEL`, the model stub), and a
 * suite that asserts "AI features are not configured" fails on one — over the
 * lane, not the product. `verify.sh` refuses such a lane and the break runner
 * takes the model away, but only for a suite whose header says
 *
 *     // Lane: no-model — <why>
 *
 * So this reads every suite: one that tests an `/ai/` route's answer for
 * "not configured" and never reads `/ai/status` (which a suite that holds
 * either way reads first) must declare it; a declared need is `no-model` or
 * `model`; and one that declares `no-model` must still assert the refusal, or
 * the header is stale. Measured 29 September: `create-menu-ai` and
 * `task-ai-bar`, the two the ledger names.
 *
 *   node scripts/check-suite-lane-need.mjs [--mutate]
 */
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const SUITES = process.env.SUITE_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'e2e')
const MIN_SUITES = process.env.SUITE_DIR ? 1 : 100

/** The source without its comments, strings kept (a route and a sentence live in strings). */
const uncommented = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')

export function need(src) {
  const m = /^\/\/ Lane: (\S+)/m.exec(src)
  return m ? m[1] : null
}

export function standsOnRefusal(src) {
  const code = uncommented(src)
  return /\/ai\//.test(code) && /not configured/i.test(code) && !/\/ai\/status/.test(code)
}

export function problems(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
  const out = []
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8')
    const declared = need(src)
    const refusal = standsOnRefusal(src)
    if (declared && declared !== 'no-model' && declared !== 'model') out.push(`${f}: declares "Lane: ${declared}", which is neither no-model nor model`)
    if (refusal && declared !== 'no-model') out.push(`${f}: asserts an /ai/ route's "not configured" answer without reading /ai/status, and does not declare "// Lane: no-model"`)
    if (declared === 'no-model' && !refusal) out.push(`${f}: declares "Lane: no-model" but asserts no refusal (or reads /ai/status) — the header is stale`)
  }
  return { files: files.length, out, declared: files.filter((f) => need(readFileSync(join(dir, f), 'utf8'))) }
}

let ok = true
const r = problems(SUITES)
if (r.files < MIN_SUITES) {
  console.error(`[lane-need] read ${r.files} suite(s) — fewer than ${MIN_SUITES}, so this says nothing`)
  ok = false
} else if (r.out.length) {
  console.error(`[lane-need] ${r.out.length} suite(s) disagree with their lane need:\n  ${r.out.join('\n  ')}`)
  ok = false
} else {
  console.log(`[lane-need] ok — ${r.files} suite(s) read; ${r.declared.length} declare a lane need (${r.declared.join(', ')}), and every suite that stands on the assistant's refusal is among them`)
}

if (ok && process.argv.includes('--mutate')) {
  const dir = mkdtempSync(join(tmpdir(), 'lane-need-'))
  const refusal = "const r = await A('/ai/planner', { method: 'POST' })\nchk(/not configured/i.test(r.error?.message), 'says why')\n"
  const cases = [
    ['undeclared refusal is caught', 'a.mjs', refusal, 1],
    ['declared refusal passes', 'b.mjs', `// Lane: no-model — refusal\n${refusal}`, 0],
    ['a suite that reads /ai/status holds either way', 'c.mjs', `const s = await A('/ai/status')\n${refusal}`, 0],
    ['a stale no-model header is caught', 'd.mjs', "// Lane: no-model — nothing\nchk(true, 'x')\n", 1],
    ['an unknown need is caught', 'e.mjs', "// Lane: sometimes\nchk(true, 'x')\n", 1],
    ['a refusal in a comment is not one', 'f.mjs', "// the /ai/ route says not configured\nchk(true, 'x')\n", 0],
    ['storage refusals are not the assistant', 'g.mjs', "chk(/not configured/.test(await A('/uploads/x').then((r) => r.error?.message)), 'x')\n", 0],
  ]
  let bad = 0
  for (const [label, file, src, want] of cases) {
    rmSync(dir, { recursive: true, force: true })
    mkdtempSync(join(tmpdir(), 'lane-need-'))
    const one = mkdtempSync(join(tmpdir(), 'lane-need-case-'))
    writeFileSync(join(one, file), src)
    const got = problems(one).out.length
    rmSync(one, { recursive: true, force: true })
    const good = got === want
    if (!good) bad += 1
    console.log(`[lane-need] mutate: ${label} — ${good ? 'ok' : `NOT ok (${got} problem(s), wanted ${want})`}`)
  }
  rmSync(dir, { recursive: true, force: true })
  if (bad) ok = false
}
process.exitCode = ok ? 0 : 1
