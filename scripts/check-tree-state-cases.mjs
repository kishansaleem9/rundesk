#!/usr/bin/env node
/*
 * THE BEFORE-AND-AFTER COMPARISON THE UNIT CLAIMS LEAN ON, ON PLANTED REPOSITORIES
 * (`lib/tree-state.mjs`; `found-30-sep/unit-claims-refuse-an-uncommitted-batch`).
 *
 * Each case makes a throwaway git repository with an apps and a packages
 * directory, takes a state, changes something or nothing, takes another, and
 * asks whether the comparison says the tree moved. The case that matters most
 * is the one the old check could not see: a file the batch had already
 * changed, changed again by a patch left applied, reads ` M` both times.
 * `--mutate` breaks the comparison one rule at a time and requires a case to
 * notice (`lib/mutate.mjs`).
 *
 *   node scripts/check-tree-state-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.TREE_STATE_UNDER_TEST ?? join(HERE, 'lib', 'tree-state.mjs')
const { treeState, treeMoved } = await import(pathToFileURL(SUBJECT).href)

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

/** A repository with one committed file in apps and one in packages; `before` runs, a state is taken, `between` runs, another. */
const planted = (before, between) => {
  const dir = mkdtempSync(join(tmpdir(), 'tree-state-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  const put = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text) }
  try {
    git('init', '-q')
    git('config', 'user.email', 'cases@rundesk.invalid')
    git('config', 'user.name', 'cases')
    put('apps/api/a.ts', 'export const a = 1\n')
    put('packages/db/b.ts', 'export const b = 1\n')
    git('add', '-A')
    git('commit', '-qm', 'base')
    before({ put, git })
    const first = treeState(dir)
    between({ put, git })
    return treeMoved(first, treeState(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const nothing = () => {}

console.log('\n▶ what must read as not moved')
chk(planted(nothing, nothing) === '', 'a clean tree left clean has not moved')
chk(planted(({ put }) => put('apps/api/a.ts', 'export const a = 2\n'), nothing) === '',
  'a batch not yet committed, left as it was, has not moved — the case the old check failed every time')
chk(planted(({ put, git }) => { put('packages/db/b.ts', 'export const b = 2\n'); git('add', '-A') }, ({ put }) => put('packages/db/b.ts', 'export const b = 2\n')) === '',
  'a staged change written again with the same bytes has not moved')
chk(planted(nothing, ({ put }) => put('docs/notes.md', 'outside apps and packages\n')) === '',
  'a change outside apps and packages is not this check’s to see')

console.log('\n▶ what must read as moved')
{
  const m = planted(nothing, ({ put }) => put('apps/api/a.ts', 'export const a = 666\n'))
  chk(m !== '', 'a clean file a patch was left on has moved', `said "${m}"`)
}
{
  const m = planted(({ put }) => put('apps/api/a.ts', 'export const a = 2\n'), ({ put }) => put('apps/api/a.ts', 'export const a = 666\n'))
  chk(/changes against HEAD/.test(m) && !/status/.test(m),
    'a file the batch already changed, changed again by a patch, has moved — though its status reads the same before and after',
    `said "${m}"`)
}
{
  const m = planted(({ put, git }) => { put('packages/db/b.ts', 'export const b = 2\n'); git('add', '-A') }, ({ put }) => put('packages/db/b.ts', 'export const b = 666\n'))
  chk(m !== '', 'a staged file with a patch left on it in the working tree has moved', `said "${m}"`)
}
{
  const m = planted(({ put }) => put('apps/api/new.ts', 'export const n = 1\n'), ({ put }) => put('apps/api/new.ts', 'export const n = 666\n'))
  chk(/untracked/.test(m), 'an untracked file of the batch, rewritten by a patch, has moved', `said "${m}"`)
}
{
  const m = planted(nothing, ({ put }) => put('packages/db/left.ts', 'export const left = 1\n'))
  chk(m !== '', 'a file a patch made and did not take away has moved', `said "${m}"`)
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.TREE_STATE_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(mutant).href)}).then((m) => console.log(typeof m.treeState, typeof m.treeMoved))`], { encoding: 'utf8' })
    return { ok: /function function/.test(r.stdout ?? ''), why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: SUBJECT,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'TREE_STATE_UNDER_TEST',
    label: 'the comparison',
    alive,
    mutations: [
      ['never-moved', "return moved.length ? `${moved.join(', ')} changed while it ran` : ''", "return ''"],
      ['always-moved', "return moved.length ? `${moved.join(', ')} changed while it ran` : ''", "return 'moved'"],
      ['status-alone', "  if (before.diff !== after.diff) moved.push('its changes against HEAD')\n", ''],
      ['untracked-unread', "  if (before.untracked !== after.untracked) moved.push('its untracked files')\n", ''],
      ['untracked-by-name-only', "    try { h.update(readFileSync(join(root, n))) } catch { h.update('(unreadable)') }\n", ''],
      ['whole-repository', "export function treeState(root, paths = ['apps', 'packages']) {", "export function treeState(root, paths = ['.']) {"],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
