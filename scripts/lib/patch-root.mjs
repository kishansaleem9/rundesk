/*
 * EVERY BREAK PATCH NAMES THE MAIN CHECKOUT. `p = '/home/user/rundesk/apps/…'`
 * is written into each one, and a runner in any other checkout has to point it
 * at its own tree before running it, as `wt-break.sh` and
 * `check-break-patches.py` (`_here()`) do. Run as written from an agent's
 * worktree, a patch edits the main checkout while the runner tests and restores
 * its own: 29 files of the main checkout were left patched that way on
 * 29 September, by `check-unit-claims.mjs` run from a worktree
 * (`found-29-sep/unit-claims-patch-the-main-checkout`).
 */
import { resolve } from 'node:path'

/** The checkout every patch names. */
export const PATCHES_ROOT = '/home/user/rundesk'

/** The patch's text, aimed at `root`: unchanged in the main checkout, every path under it moved elsewhere. */
export const aimedAt = (patchText, root) => {
  const here = resolve(root)
  if (here === PATCHES_ROOT) return patchText
  return patchText.split(`${PATCHES_ROOT}/`).join(`${here}/`)
}
