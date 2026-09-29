#!/usr/bin/env node
/**
 * A self-test for `scripts/lib/patch-root.mjs`, which aims a break patch at the
 * checkout that runs it (`found-29-sep/unit-claims-patch-the-main-checkout`).
 *
 * Every patch writes `/home/user/rundesk/…`. Run as written from an agent's
 * worktree, `check-unit-claims.mjs` patched 29 files of the main checkout and
 * restored its own, and every claim read green. The helper is the difference
 * between measuring the tree that runs and damaging the one that commits.
 *
 *   node scripts/check-patch-root.mjs [--mutate]
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.PATCH_ROOT_LIB ?? join(HERE, 'lib/patch-root.mjs')
const { aimedAt, PATCHES_ROOT } = await import(SUBJECT)

let failed = 0
const is = (got, want, what) => {
  const ok = got === want
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}

const patch = [
  "p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'",
  "q = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'",
  '# measured against /home/user/rundesk-old, a different tree',
].join('\n')

console.log('▶ a patch aimed at the checkout that runs it')
is(PATCHES_ROOT, '/home/user/rundesk', 'the patches name the main checkout')
is(aimedAt(patch, '/home/user/rundesk'), patch, 'in the main checkout it runs as written')
is(aimedAt(patch, '/home/user/rundesk/'), patch, 'however that root is spelled')
const moved = aimedAt(patch, '/home/user/rundesk/.claude/worktrees/agent-x')
is(
  moved.split('\n')[0],
  "p = '/home/user/rundesk/.claude/worktrees/agent-x/apps/api/src/modules/planner/planner.service.ts'",
  'from a worktree, the file it writes is the worktree’s',
)
is(
  moved.split('\n')[1],
  "q = '/home/user/rundesk/.claude/worktrees/agent-x/apps/web/src/lib/i18n/catalogs.ts'",
  'and so is every other file it names',
)
is(moved.split('\n')[2], '# measured against /home/user/rundesk-old, a different tree', 'and a path that only begins the same is left alone')

console.log(`\n${failed === 0 ? 'ok' : 'not ok'} patch-root: ${failed} case(s) failed`)
if (failed) process.exitCode = 1

if (process.argv.includes('--mutate') && !process.env.PATCH_ROOT_LIB) {
  const blind = proveMutationsBite({
    subject: join(HERE, 'lib/patch-root.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'PATCH_ROOT_LIB',
    label: 'the patch aimer',
    alive: (mutant) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(mutant)})`], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      return { ok: r.status === 0, why: (r.stderr ?? '').trim() }
    },
    mutations: [
      ['a patch runs as written from anywhere', 'if (here === PATCHES_ROOT) return patchText', 'return patchText'],
      ['only the first path is moved', 'return patchText.split(`${PATCHES_ROOT}/`).join(`${here}/`)', 'return patchText.replace(`${PATCHES_ROOT}/`, `${here}/`)'],
      ['a path that only begins the same is moved too', 'return patchText.split(`${PATCHES_ROOT}/`).join(`${here}/`)', 'return patchText.split(PATCHES_ROOT).join(here)'],
      ['the root is compared as spelled', 'const here = resolve(root)', 'const here = root'],
    ],
  })
  if (blind) process.exitCode = 1
}
