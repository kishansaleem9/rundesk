#!/usr/bin/env node
/*
 * THE FOUR CLAIMS NOTHING MEASURED.
 *
 * `check-break-reddened.mjs` reads a run log and asks whether the patch reddened
 * the check it names. It cannot do that for a `unit:` claim — the evidence is a
 * `*.test.ts` and an e2e log has nothing to say about it — so those four were
 * counted, excluded, and reported as "claim a unit test". Honest, and it left
 * four claims in the inventory that were DECLARED rather than measured, in an
 * audit whose whole thesis is the difference.
 *
 * They are also the cheapest claims here to measure. No browser, no database,
 * no lane: `tsx --test <file>` is about a second. So this applies each patch,
 * runs the test file its claim names, and requires the run to FAIL — and to
 * fail with the quoted test's own name in the output, so a patch that breaks
 * some other test in the same file is not credited with reddening this one.
 *
 * IT EDITS THE WORKING TREE, which is why it is preflight-only and why it
 * checks up after itself. Every file a patch touches is copied first and
 * written back in a `finally`, and then `git status --porcelain` has to come
 * back clean for those paths or this exits non-zero saying so. A checker that
 * leaves a break patch applied would put it in the next commit — the one thing
 * `check-no-break-patches.mjs` exists to catch, arriving through the tool that
 * was supposed to be careful.
 *
 *   node scripts/check-unit-claims.mjs
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, utimesSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BREAKS = join(ROOT, 'test/e2e/breaks')

// Measured 22 September: four `unit:` claims, four reddened. A floor, because
// the failure this guards is a patch quietly stopping to break its test — the
// same shape as a green in the e2e sweep.
const BASELINE = { reddened: 4 }

const find = (name, dir = ROOT) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      const hit = find(name, p)
      if (hit) return hit
    } else if (e.name === name) return p
  }
  return null
}

// `# Reddens: unit: <file>.test.ts "<test name>"`, with the name possibly
// wrapped onto the continuation line the rest of this audit uses.
const claimOf = (text) => {
  const lines = text.split('\n')
  const i = lines.findIndex((l) => /^#\s*Reddens:\s*unit\b/i.test(l))
  if (i === -1) return null
  let block = lines[i].replace(/^#\s*Reddens:\s*unit:?\s*/i, '')
  for (let j = i + 1; j < lines.length; j++) {
    if (!/^#\s{2,}\S/.test(lines[j])) break
    block += ' ' + lines[j].replace(/^#\s+/, '')
  }
  const file = block.match(/([A-Za-z0-9_.-]+\.test\.tsx?)/)?.[1] ?? null
  const name = block.match(/"([^"]+)"/)?.[1] ?? null
  return file ? { file, name } : null
}

const reddened = []
const green = []
/*
 * A SIGNAL NO LONGER LEAVES A PATCH APPLIED. The restore is a `finally`, and a
 * default SIGTERM ended the process inside it: a preflight stopped during this
 * step on 28 September left a patch applied to `tasks.service.ts`, with a fresh
 * mtime that made every lane refuse its API build as stale.
 *
 * With a handler registered, node delivers SIGINT, SIGTERM and SIGHUP on its
 * event loop — and the loop below is synchronous, so a signal WAITS for it:
 * every patch is applied, run and restored by its own `finally`, and the
 * process then exits. Measured on 28 September: SIGTERM sent while
 * `ai-containers.ts` was patched; the run finished its 37 claims and the tree
 * was identical, bytes and times. Stopping this step therefore takes as long
 * as the step. The handler still restores whatever is pending, for the day the
 * loop gains an `await`. SIGKILL cannot be caught; nothing here helps then.
 */
let pending = null
const restore = (files) => {
  for (const [abs, was] of files) {
    writeFileSync(abs, was.bytes)
    utimesSync(abs, was.atime, was.mtime)
  }
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    if (pending) restore(pending)
    console.error(`check-unit-claims: ${sig} — ${pending ? `restored ${pending.size} patched file(s)` : 'nothing was patched'}`)
    process.exit(130)
  })
}

const unknown = []

for (const f of readdirSync(BREAKS).filter((x) => x.endsWith('.py')).sort()) {
  const patch = join(BREAKS, f)
  const text = readFileSync(patch, 'utf8')
  const claim = claimOf(text)
  if (!claim) continue
  const name = f.slice(0, -3)

  const testPath = find(claim.file)
  if (!testPath) {
    unknown.push(`${name} — no file named ${claim.file} anywhere in the repository`)
    continue
  }
  // Which app owns it decides how it runs: `apps/api` has node:test suites and
  // `apps/web`'s are plain scripts, exactly as their own `test` scripts run them.
  const app = testPath.includes('/apps/api/') ? join(ROOT, 'apps/api') : join(ROOT, 'apps/web')
  const args = testPath.includes('/apps/api/') ? ['tsx', '--test', testPath] : ['tsx', testPath]

  const touched = [
    ...new Set(
      [...text.matchAll(/\/home\/user\/rundesk\/((?:apps|packages)\/[A-Za-z0-9_./-]+)/g)].map(
        (m) => m[1],
      ),
    ),
  ]
  const backup = new Map()
  for (const rel of touched) {
    const abs = join(ROOT, rel)
    if (existsSync(abs)) {
      // Milliseconds with their fraction: a Date rounds to the millisecond,
      // and rounding UP made a restored file newer than it was.
      const { atimeMs, mtimeMs } = statSync(abs)
      backup.set(abs, { bytes: readFileSync(abs), atime: atimeMs / 1000, mtime: mtimeMs / 1000 })
    }
  }
  if (!backup.size) {
    unknown.push(`${name} — names no file under apps/ or packages/, so nothing could be applied`)
    continue
  }
  pending = backup

  let applied = false
  let out = ''
  let failed = null
  try {
    execFileSync('python3', [patch], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    applied = true
    try {
      out = execFileSync('pnpm', ['exec', ...args], {
        cwd: app,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 180_000,
      })
      failed = false
    } catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`
      failed = true
    }
  } catch (e) {
    unknown.push(`${name} — the patch would not apply: ${String(e.message).split('\n')[0]}`)
  } finally {
    /*
     * THE BYTES, AND THE TIME. Writing the same bytes back still moved each
     * file's mtime, and `verify.sh` judges a lane's build stale by mtime — so
     * after every preflight all four lanes were refused as "older than the
     * source it is built from" over six files that had not changed (found
     * 23 September: `person-panel.tsx`, `ai-cost.ts` and four more, all
     * written in the same second this ran).
     */
    restore(backup)
    pending = null
  }
  if (!applied) continue

  if (failed !== true) {
    green.push(`${name} — ${claim.file} still passed with the patch applied`)
    continue
  }
  // AND IT HAS TO BE THE NAMED TEST. A patch that breaks a neighbour in the same
  // file would otherwise be credited with reddening the one it claims.
  if (claim.name && !out.includes(claim.name)) {
    unknown.push(
      `${name} — ${claim.file} failed, but nothing in the output names "${claim.name.slice(0, 48)}"`,
    )
    continue
  }
  reddened.push(name)
}

// THE TREE GOES BACK EXACTLY AS IT WAS, and this says so rather than assuming.
let dirty = ''
try {
  dirty = execFileSync('git', ['status', '--porcelain', '--', 'apps', 'packages'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
} catch {
  /* not a git checkout; the copies were still written back */
}

console.log(
  `[unit-claims] ${reddened.length} reddened the unit test they name · ${green.length} did not · ` +
    `${unknown.length} unreadable`,
)
for (const r of reddened) console.log(`    ok   ${r}`)
for (const r of green) console.log(`  GREEN  ${r}`)
for (const r of unknown) console.log(`  ????   ${r}`)

let bad = 0
if (dirty) {
  console.error(
    `\n[unit-claims] the working tree is NOT back as it was:\n${dirty}\n` +
      'Restore these before committing — a break patch left applied is what ' +
      '`check-no-break-patches.mjs` exists to catch.',
  )
  bad = 1
}
if (green.length) {
  console.error(
    `\n[unit-claims] ${green.length} patch(es) left their unit test passing. A claim whose test ` +
      'still passes with the patch applied is a claim about nothing.',
  )
  bad = 1
}
if (reddened.length < BASELINE.reddened) {
  console.error(
    `\n[unit-claims] only ${reddened.length} of ${BASELINE.reddened} unit claims are measured. ` +
      'These are the cheapest claims here to check — a second each — so a fall means a patch ' +
      'stopped applying or a test file moved.',
  )
  bad = 1
}
process.exitCode = bad
