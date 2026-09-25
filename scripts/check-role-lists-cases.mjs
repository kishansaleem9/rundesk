#!/usr/bin/env node
/*
 * THE ROLE-LIST GATE, ON TREES BUILT TO FOOL IT.
 *
 * `check-role-lists.mjs` answers "ok" on the real tree, and a gate whose only
 * observed answer is "ok" cannot be told from one that reads nothing. So each
 * case plants a small API source tree and runs the real gate against it, and
 * `--mutate` breaks the gate one rule at a time and requires a case to notice
 * (`lib/mutate.mjs`).
 *
 * The ways a list can hide: split across lines, double-quoted, inside a
 * `new Set(...)` or an `inArray(...)`, or in the web. The ways a list is
 * allowed: in the API's `common/permissions` or the web's role hook, in a unit
 * test, or a single role in brackets, which is no list. And the ways the gate
 * can pass on nothing: no source directory, or one with no TypeScript in it.
 *
 *   node scripts/check-role-lists-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = process.env.GATE_UNDER_TEST ?? join(HERE, 'check-role-lists.mjs')

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

/** A web tree with nothing in it but a file, so the API cases are about the API. */
const QUIET_WEB = { 'apps/web/src/main.tsx': "export const main = 'web'\n" }

/** Plant `files` ({ 'apps/…/src/…': text }) in a throwaway tree and run the gate there. */
const plant = (files, { web = QUIET_WEB } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'role-lists-'))
  try {
    for (const [path, text] of Object.entries({ ...web, ...files })) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', cwd: tmpdir(), env: { ...process.env, ROLE_LISTS_ROOT: dir } })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const MOD = 'apps/api/src/modules/things/things.service.ts'
const IMPORTS = "import { isManagerRole } from '../../common/permissions/workspace-roles'\nexport const ok = isManagerRole('member')\n"

console.log('\n▶ lists the gate must find')
{
  const r = plant({ [MOD]: `${IMPORTS}export const isAdmin = (r: string) => ['workspace_admin', 'super_admin'].includes(r)\n` })
  chk(r.code === 1 && /things\.service\.ts:3/.test(r.out), 'a role list in a module is a failure, named by file and line', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ [MOD]: `${IMPORTS}export const staff = [\n  'workspace_admin',\n  'manager',\n]\n` })
  chk(r.code === 1 && /things\.service\.ts:3/.test(r.out), 'a list split across lines is found where it opens', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ [MOD]: `${IMPORTS}const ADMINS = new Set(["super_admin", "workspace_admin"])\n` })
  chk(r.code === 1 && /things\.service\.ts:3/.test(r.out), 'a double-quoted list inside a Set is found', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ [MOD]: `${IMPORTS}where(inArray(workspaceMembers.role, ['member', 'guest']))\n` })
  chk(r.code === 1 && /things\.service\.ts:3/.test(r.out), 'a list handed to inArray is found, whichever roles it names', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ [MOD]: IMPORTS, 'apps/web/src/pages/teams-page.tsx': "const MAY = ['workspace_admin', 'manager', 'super_admin']\n" })
  chk(r.code === 1 && /pages\/teams-page\.tsx:1/.test(r.out), 'a role list in a web page is found too', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log('\n▶ what the gate must let be')
{
  const r = plant({
    'apps/api/src/common/permissions/workspace-roles.ts': "export const WS_ADMIN_ROLES = ['workspace_admin', 'super_admin'] as const\n",
    'apps/api/src/modules/things/things.service.test.ts': "assert.deepEqual(roles, ['workspace_admin', 'manager'])\n",
    [MOD]: `${IMPORTS}export const one = ['guest']\n`,
  }, { web: { 'apps/web/src/hooks/use-workspace-role.ts': "export const MANAGERS = ['workspace_admin', 'manager', 'super_admin']\n" } })
  chk(r.code === 0 && /4 file\(s\) read/.test(r.out), 'the one module, the web’s role hook, a unit test and a single role in brackets are all let be — and every file is read', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log('\n▶ passing on nothing')
{
  const r = plant({})
  chk(r.code === 1 && /no source for the API/.test(r.out), 'no API source is a failure, not a silent pass', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ 'apps/api/src/README.md': "['workspace_admin', 'manager']\n" })
  chk(r.code === 1 && /holds no TypeScript/.test(r.out), 'a source directory with no TypeScript is a failure', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.GATE_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8' })
    return { ok: /ok\b/.test(r.stdout ?? ''), why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: GATE,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'GATE_UNDER_TEST',
    label: 'the gate',
    alive,
    mutations: [
      ['misses-pass', 'process.exitCode = 1', 'process.exitCode = 0'],
      ['allowed-everywhere', 'if (isTest(file) || tree.allowed(file)) continue', 'if (true) continue'],
      ['web-allowed-anywhere', "allowed: (f) => f === join(WEB, 'hooks', 'use-workspace-role.ts')", 'allowed: () => true'],
      ['web-unread', "  { src: WEB, name: 'the web', allowed: (f) => f === join(WEB, 'hooks', 'use-workspace-role.ts') },\n", ''],
      ['one-line-only', '\\\\s*,\\\\s*', '[ \\\\t]*,[ \\\\t]*'],
      ['single-quotes-only', "const ROLE = `[\"'\\`]", "const ROLE = `[']"],
      ['no-src-passes', 'if (!existsSync(tree.src)) {', 'if (false) {'],
      ['empty-src-passes', 'if (read === 0) problems.push', 'if (false) problems.push'],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
