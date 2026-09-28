#!/usr/bin/env node
/*
 * THE OFFERED-KEYS GATE, ON PLANTED TREES.
 *
 * Each case plants a catalog, some API source and a ledger in a throwaway
 * tree and runs the gate there: every key asked; a key asked by nothing; one
 * asked only in a comment, only in a unit test; a key asked that the catalog
 * lacks; an exemption gone stale three ways; an empty catalog and no source.
 * `--mutate` breaks the gate one rule at a time.
 *
 * THE EXEMPTIONS ARE PLANTED TOO. The gate's own list is empty (the last six
 * keys it held are asked, or left the catalog), so a case that read it could
 * no longer show an exemption's rules biting. Each tree is run with its own,
 * through `PERMISSION_KEYS_EXEMPT`, which the gate honours only in a planted
 * tree; one case runs with none at all.
 *
 *   node scripts/check-permission-keys-asked-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = process.env.GATE_UNDER_TEST ?? join(HERE, 'check-permission-keys-asked.mjs')

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

/**
 * Planted exemptions, owned by the item that last held real ones — open in the
 * planted ledger, whatever the real one says of it: the gate's own list is empty.
 */
const EXEMPT_KEYS = ['kappa.pending', 'lambda.pending', 'mu.pending']
const EXEMPTIONS = Object.fromEntries(EXEMPT_KEYS.map((k) => [k, 'role-editor-offers-unenforced-permissions']))
const catalogOf = (keys) =>
  `export const PERMISSION_CATALOG = [\n${keys.map((k) => `  { key: '${k}', label: '${k}', description: '', category: 'X' },`).join('\n')}\n]\n`
const OPEN_LEDGER = '# Open work\n\n### `found-23-sep/role-editor-offers-unenforced-permissions` — partly-fixed, large\n\nText.\n'
const CATALOG = 'apps/api/src/modules/custom-roles/permission-catalog.ts'
const MOD = 'apps/api/src/modules/things/things.controller.ts'
const ASKS_ALL = [
  "@RequirePermissions('alpha.manage')",
  "export class Things {",
  "  a = this.roles.hasPermission(ws, id, 'beta.view')",
  "  b = this.roles.holdersOf(ws,\n    'gamma.run')",
  "}",
].join('\n') + '\n'

/** Plant `files` ({ path: text }) in a throwaway tree and run the gate there, with `exempt` for its exemptions. */
const plant = (files, exempt = EXEMPTIONS) => {
  const dir = mkdtempSync(join(tmpdir(), 'perm-keys-'))
  try {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) continue
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    const r = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      cwd: tmpdir(),
      env: { ...process.env, PERMISSION_KEYS_ROOT: dir, PERMISSION_KEYS_EXEMPT: JSON.stringify(exempt) },
    })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const tree = (over = {}) => ({
  [CATALOG]: catalogOf(['alpha.manage', 'beta.view', 'gamma.run', ...EXEMPT_KEYS]),
  [MOD]: ASKS_ALL,
  'docs/open-work.md': OPEN_LEDGER,
  ...over,
})

console.log('\n▶ what the gate lets be')
{
  const r = plant(tree())
  chk(r.code === 0 && /6 key\(s\) offered: 3 asked by a route or service, 3 exempt/.test(r.out), 'every key asked — by the decorator, hasPermission and holdersOf across lines — and the exemptions open: ok, and counted', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ [CATALOG]: catalogOf(['alpha.manage', 'beta.view', 'gamma.run']) }), {})
  chk(r.code === 0 && /3 key\(s\) offered: 3 asked by a route or service, none exempt/.test(r.out), 'with no exemption at all, every key asked: ok, and none exempt', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log('\n▶ what the gate must find')
{
  const r = plant(tree({ [CATALOG]: catalogOf(['alpha.manage', 'beta.view', 'gamma.run', 'delta.nothing', ...EXEMPT_KEYS]) }))
  chk(r.code === 1 && /asked by no route or service[\s\S]*delta\.nothing/.test(r.out), 'a key offered and asked by nothing is a failure, named', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ [MOD]: ASKS_ALL.replace("@RequirePermissions('alpha.manage')", "// @RequirePermissions('alpha.manage')\n/* hasPermission(ws, id, 'alpha.manage') */") }))
  chk(r.code === 1 && /asked by no route or service[\s\S]*alpha\.manage/.test(r.out), 'a key asked only in comments asks nothing', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({
    [MOD]: ASKS_ALL.replace("@RequirePermissions('alpha.manage')", ''),
    'apps/api/src/modules/things/things.controller.test.ts': "hasPermission(ws, id, 'alpha.manage')\n",
  }))
  chk(r.code === 1 && /asked by no route or service[\s\S]*alpha\.manage/.test(r.out), 'a key asked only in a unit test asks nothing', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ [MOD]: `${ASKS_ALL}@RequirePermissions('omega.typo')\nexport class More {}\n` }))
  chk(r.code === 1 && /the catalog does not have[\s\S]*omega\.typo/.test(r.out), 'a key asked that the catalog lacks is a failure, named with where', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ [MOD]: `${ASKS_ALL}@RequirePermissions('kappa.pending')\nexport class Pending {}\n` }))
  chk(r.code === 1 && /exemption for kappa\.pending is stale: it is asked now/.test(r.out), 'an exempt key asked now is a stale exemption', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ [CATALOG]: catalogOf(['alpha.manage', 'beta.view', 'gamma.run', ...EXEMPT_KEYS.filter((k) => k !== 'mu.pending')]) }))
  chk(r.code === 1 && /exemption for mu\.pending is stale: the catalog no longer offers it/.test(r.out), 'an exempt key gone from the catalog is a stale exemption', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'docs/open-work.md': OPEN_LEDGER.replace('— partly-fixed, large', '— **closed**') }))
  chk(r.code === 1 && /which is not open/.test(r.out), 'an exemption whose item is closed is a failure', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'docs/open-work.md': '# Open work\n\nNothing here.\n' }))
  chk(r.code === 1 && /which is no item of/.test(r.out), 'an exemption naming no item of the ledger is a failure', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ [CATALOG]: 'export const PERMISSION_CATALOG = []\n' }))
  chk(r.code === 1 && /offers no key: nothing was read/.test(r.out), 'an empty catalog is a failure, not a pass', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ 'docs/open-work.md': OPEN_LEDGER })
  chk(r.code === 1 && /nothing was read/.test(r.out), 'no catalog and no source at all is a failure', `it exited ${r.code}: ${r.out.trim()}`)
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
      ['comments-count', '    const code = stripComments(readFileSync(file, \'utf8\'))\n', '    const code = readFileSync(file, \'utf8\')\n'],
      ['tests-count', '    if (isTest(file) || file === CATALOG) continue\n', '    if (file === CATALOG) continue\n'],
      ['unasked-passes', '  if (!asked.has(key) && !(key in EXEMPT)) unasked.push(key)\n', '  if (false) unasked.push(key)\n'],
      ['unknown-passes', 'if (catalog.size > 0 && unknown.length > 0) {', 'if (false) {'],
      ['stale-asked-passes', '  if (asked.has(key)) problems.push(', '  if (false) problems.push('],
      ['closed-passes', "  else if (!/^(open|partly)/.test(status)) problems.push(", '  else if (false) problems.push('],
      ['empty-passes', '  if (catalog.size === 0) problems.push(', '  if (false) problems.push('],
      ['planted-exemptions-ignored', '  ? JSON.parse(process.env.PERMISSION_KEYS_EXEMPT)\n', '  ? {}\n'],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
