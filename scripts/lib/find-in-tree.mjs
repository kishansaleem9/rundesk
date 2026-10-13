/*
 * THE FIRST FILE OF A NAME IN THIS CHECKOUT — and only this checkout.
 *
 * A NESTED CHECKOUT IS ANOTHER TREE. `git worktree add` inside the repository,
 * and the agents' own worktrees under `.claude/worktrees/`, put a whole copy of
 * the repository inside this one, marked by a `.git` at its top (a file for a
 * worktree, a directory for a clone). Walking into one finds ITS copy of a
 * file, which is not the file this checkout's patches edit.
 *
 * `check-unit-claims.mjs` walked the whole repository for the test file a
 * claim names. On 29 September, with two agent worktrees under `.claude/`, it
 * found theirs first: it patched this tree, ran their unpatched copies, and
 * reported 0 of 41 claims reddened — 16 "still passed", 25 failed without the
 * test's name. A nested checkout is now passed over whole.
 *
 * `scripts/check-find-in-tree.mjs --mutate` builds a tree with a nested
 * checkout holding the same name and requires the outer file, and requires a
 * copy of this walker without the rule to return the nested one.
 */
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** Directories no walk of the source ever needs. */
export const SKIPPED = ['node_modules', 'dist', '.git']

/** A directory below `root` that is the top of another checkout. */
export const isNestedCheckout = (dir, root) => dir !== root && existsSync(join(dir, '.git'))

export const findInTree = (name, root, dir = root) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED.includes(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (isNestedCheckout(p, root)) continue
      const hit = findInTree(name, root, p)
      if (hit) return hit
    } else if (e.name === name) return p
  }
  return null
}

/*
 * EVERY FILE OF A NAME IN THIS CHECKOUT, for a reader that must not guess
 * between two (`found-13-oct/unit-claims-read-a-name-two-files-share`). The
 * first of a name is the right answer only while the name is unique: batch 38
 * gave the API a `sheet-file.test.ts` beside the web's, the walk reached
 * `apps/api` first, and six claims on the web's test were measured against the
 * API's — which a patch to the web never touches — and read "still passed".
 * Nested checkouts are passed over as above.
 */
export const findAllInTree = (name, root, dir = root, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED.includes(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (isNestedCheckout(p, root)) continue
      findAllInTree(name, root, p, out)
    } else if (e.name === name) out.push(p)
  }
  return out
}
