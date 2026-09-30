/*
 * WHAT A CHECKOUT HOLDS BEYOND ITS COMMIT, SO A RUN CAN SAY IT PUT IT BACK
 * (`found-30-sep/unit-claims-refuse-an-uncommitted-batch`).
 *
 * `check-unit-claims.mjs` applies break patches to the working tree and
 * restores them, then had to prove it had: it asked `git status --porcelain`
 * for apps and packages and failed on any line at all. So every batch not yet
 * committed failed it, whatever the claims did, and a patch left applied on
 * top of that batch read the same as the batch alone.
 *
 * A state is taken before the first patch and again after the last, and the
 * run fails only when they differ. By content, not by status: a file the batch
 * already changed reads ` M` before and after, whether or not a patch was left
 * on it. So a state is the status lines, a digest of the diff against HEAD,
 * and a digest of every untracked file's name and bytes.
 *
 *   treeState(root, paths)  → { status, diff, untracked }
 *   treeMoved(before, after) → '' when they are the same, else what moved
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 1 << 30 })
const digest = (buf) => createHash('sha1').update(buf).digest('hex')

export function treeState(root, paths = ['apps', 'packages']) {
  const status = git(root, ['status', '--porcelain', '--', ...paths]).toString('utf8').trim()
  const diff = digest(git(root, ['diff', 'HEAD', '--binary', '--', ...paths]))
  const names = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...paths])
    .toString('utf8').split('\0').filter(Boolean).sort()
  const h = createHash('sha1')
  for (const n of names) {
    h.update(n).update('\0')
    try { h.update(readFileSync(join(root, n))) } catch { h.update('(unreadable)') }
    h.update('\0')
  }
  return { status, diff, untracked: h.digest('hex') }
}

export function treeMoved(before, after) {
  const moved = []
  if (before.status !== after.status) moved.push('its status')
  if (before.diff !== after.diff) moved.push('its changes against HEAD')
  if (before.untracked !== after.untracked) moved.push('its untracked files')
  return moved.length ? `${moved.join(', ')} changed while it ran` : ''
}
