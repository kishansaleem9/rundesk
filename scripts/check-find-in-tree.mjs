#!/usr/bin/env node
/**
 * A NESTED CHECKOUT IS NOT READ AS THIS TREE.
 *
 * `scripts/lib/find-in-tree.mjs` finds the file a unit claim names. On 29
 * September two agent worktrees sat under `.claude/worktrees/`, each a whole
 * copy of the repository, and the walk found their copy of every test first:
 * `check-unit-claims.mjs` patched this tree and ran theirs, and read 0 of 41
 * claims as reddening.
 *
 * This builds a throwaway tree holding the same test file twice — once where
 * the tree keeps it, once inside a nested checkout that sorts first (a `.git`
 * FILE at its top, as `git worktree add` leaves one) — and requires the walk
 * to return the tree's own. With `--mutate` it also requires a copy of the
 * walker WITHOUT the nested-checkout rule to return the nested one: otherwise
 * the tree below proves nothing about the rule.
 *
 *   node scripts/check-find-in-tree.mjs [--mutate]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const LIB = path.join(ROOT, 'scripts/lib/find-in-tree.mjs')
const NAME = 'claims.test.ts'

const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'find-in-tree-'))
const own = path.join(tree, 'apps/api/src/claims.test.ts')
// A second of the name in this tree: `findAllInTree` must give both, and the nested copy never.
const ownWeb = path.join(tree, 'apps/web/src/claims.test.ts')
const nested = path.join(tree, '.claude/worktrees/agent-1/apps/api/src/claims.test.ts')
for (const f of [own, ownWeb, nested]) {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, '')
}
fs.writeFileSync(path.join(tree, '.claude/worktrees/agent-1/.git'), 'gitdir: /elsewhere\n')

const findWith = async (libPath) => (await import(pathToFileURL(libPath).href + `?v=${Date.now()}`)).findInTree
const findAllWith = async (libPath) => (await import(pathToFileURL(libPath).href + `?v=${Date.now()}`)).findAllInTree

let failed = false
try {
  const got = (await findWith(LIB))(NAME, tree)
  if (got !== own) {
    console.error(`[find-in-tree] not ok: asked for ${NAME}, got ${got ? path.relative(tree, got) : 'nothing'} — the tree's own is ${path.relative(tree, own)}`)
    failed = true
  } else {
    console.log(`[find-in-tree] ok — ${NAME} is the tree's own, not the nested checkout's copy`)
  }

  // Every file of the name, for the reader that must refuse two (`found-13-oct/unit-claims-read-a-name-two-files-share`).
  const all = ((await findAllWith(LIB))(NAME, tree) ?? []).map((p) => path.relative(tree, p)).sort()
  const want = [own, ownWeb].map((p) => path.relative(tree, p)).sort()
  if (JSON.stringify(all) !== JSON.stringify(want)) {
    console.error(`[find-in-tree] not ok: every ${NAME} should be ${JSON.stringify(want)}, got ${JSON.stringify(all)}`)
    failed = true
  } else {
    console.log(`[find-in-tree] ok — every ${NAME} is both of the tree's own, and not the nested checkout's`)
  }

  if (!failed && process.argv.includes('--mutate')) {
    // The same rule in the walk that gathers them all: without it, the nested copy is a third.
    const srcAll = fs.readFileSync(LIB, 'utf8')
    const marker = 'export const findAllInTree'
    const at = srcAll.indexOf(marker)
    const mutantAll = at === -1 ? srcAll : srcAll.slice(0, at) + srcAll.slice(at).replace('if (isNestedCheckout(p, root)) continue', '')
    if (mutantAll === srcAll) {
      console.error('[find-in-tree] the mutation of findAllInTree found nothing to change — this check cannot say it bites')
      failed = true
    } else {
      const copyAll = path.join(path.dirname(LIB), `.find-in-tree-all-mutant-${process.pid}.mjs`)
      fs.writeFileSync(copyAll, mutantAll)
      try {
        const got = ((await findAllWith(copyAll))(NAME, tree) ?? []).length
        if (got !== 3) {
          console.error(`[find-in-tree] without the rule findAllInTree still found ${got} — the fixture proves nothing`)
          failed = true
        } else {
          console.log('[find-in-tree] mutation bites: without the rule findAllInTree also finds the nested checkout\'s copy')
        }
      } finally {
        fs.rmSync(copyAll, { force: true })
      }
    }
  }

  if (!failed && process.argv.includes('--mutate')) {
    const src = fs.readFileSync(LIB, 'utf8')
    const mutant = src.replace('if (isNestedCheckout(p, root)) continue', '')
    if (mutant === src) {
      console.error('[find-in-tree] the mutation found nothing to change — this check cannot say it bites')
      failed = true
    } else {
      const copy = path.join(path.dirname(LIB), `.find-in-tree-mutant-${process.pid}.mjs`)
      fs.writeFileSync(copy, mutant)
      try {
        const wrong = (await findWith(copy))(NAME, tree)
        if (wrong !== nested) {
          console.error(`[find-in-tree] without the rule the walk still returned ${wrong ? path.relative(tree, wrong) : 'nothing'} — the fixture does not put the nested copy first, so it proves nothing`)
          failed = true
        } else {
          console.log('[find-in-tree] mutation bites: without the rule the walk returns the nested checkout\'s copy')
        }
      } finally {
        fs.rmSync(copy, { force: true })
      }
    }
  }
} finally {
  fs.rmSync(tree, { recursive: true, force: true })
}
process.exitCode = failed ? 1 : 0
