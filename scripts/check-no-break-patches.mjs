#!/usr/bin/env node
/**
 * Refuse to ship a break patch.
 *
 * The audit's step 6 applies deliberately-broken edits to the working tree,
 * rebuilds, and watches a check go red. That is the step that proves a check
 * is a check. It also means the tree spends minutes at a time containing code
 * written to be wrong — and on a shared tree, with more than one pair of hands
 * in it, a `git add -A` eventually catches one.
 *
 * It did. `43f7b57` shipped
 *
 *     data-testid="task-add-fields-DISABLED"
 *     hidden
 *
 * on the Add-fields button: a control that renders and does nothing. Nothing
 * failed, the diff read as deliberate — "DISABLED" looks like a decision
 * somebody took — and it was found only because the agent whose patch it was
 * went looking through HEAD for its own signatures afterwards.
 *
 * Vigilance is not a control. This is.
 *
 * WHAT IT LOOKS FOR. Break patches in this repo mark their damage two ways:
 * a testid suffixed `-DISABLED`, and a `BROKEN:` comment. Both are things no
 * honest change has a reason to contain. If you are adding a patch style,
 * make it leave one of these and add it here — a patch that hides itself is
 * the whole problem this file exists for.
 *
 * Deliberately NOT a git hook: hooks are per-clone and skippable with
 * `--no-verify`. This runs in the `Verify Monorepo` job, which is four
 * minutes and always runs, including on a docs-only push.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bail } from './lib/bail.mjs'

/*
 * ANCHORED TO THIS FILE, NOT TO WHEREVER IT WAS RUN FROM.
 *
 * `ROOTS` were relative and reached through `fs.existsSync(root)`, so from any
 * directory but the repository root every root missed, the walk visited nothing
 * and this printed "clean — no break-patch signatures in apps, packages or
 * test" with a zero exit. A control that passes by looking at nothing is worse
 * than no control: it is the vigilance this file's header rejects, wearing a
 * green tick. `preflight.sh` happens to `cd` first, which is exactly why it
 * went unnoticed.
 *
 * The count below is the other half. "Clean" now means "I read N files and
 * none of them carried a signature", and N is asserted — because the failure
 * this guards against is not a signature going undetected, it is the scan
 * quietly covering nothing.
 */
/*
 * `BREAK_SCAN_ROOT` exists so `check-patch-guard.mjs` can plant signatures in a
 * throwaway tree instead of in this one. The alternative is a case file that
 * writes `BROKEN:` into a real component and restores it, which is the exact
 * accident this script was written after — `43f7b57` shipped a `-DISABLED`
 * testid because a step-6 edit outlived the step. A test for this guard must
 * not need the guard.
 */
const REPO =
  process.env.BREAK_SCAN_ROOT ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = ['apps', 'packages', 'test'].map((r) => path.join(REPO, r))
const EXT = /\.(ts|tsx|mjs|js|jsx|css|sql)$/
// Measured 22 September: 2,526 files under the three roots, from the repository
// root and from `/tmp` alike. A floor rather than an equality, because the tree
// grows — and the number it guards against is 0, or the handful a half-resolved
// root would leave.
// The floor does not apply to a planted tree, which is four files by design.
// `BREAK_SCAN_ROOT` is set by the case file and by nothing else.
const MIN_SCANNED = process.env.BREAK_SCAN_ROOT ? 1 : 2000

/**
 * Each pattern is something a break patch writes and ordinary code does not.
 * `why` is printed on a hit, because the person reading the failure has
 * probably never heard of the break harness.
 */
const SIGNATURES = [
  {
    re: /data-testid=["'][^"']*-DISABLED["']/,
    why: 'a testid suffixed `-DISABLED` — break patches rename a testid to take a control out of a suite’s reach',
  },
  {
    re: /(\/\/|\/\*|#)\s*BROKEN:/,
    why: 'a `BROKEN:` comment — break patches leave one where they cut a line out',
  },
]

/** This file names the patterns, so it would match itself. */
/*
 * THIS EXCLUSION IS DEAD, AND SAYING SO IS THE POINT.
 *
 * It was written because this file names both patterns in its own `SIGNATURES`
 * list, and a scan that reported itself would be switched off within a day. But
 * `ROOTS` is `apps`, `packages` and `test` — `scripts/` is never walked, so the
 * comparison can never be true. `check-patch-guard.mjs` found it: the mutation
 * that replaces this test with `true` changes no answer, which is the signature
 * of a guard against a case that cannot happen.
 *
 * Kept rather than deleted, with the reason written down, because the scope it
 * depends on is a DECISION and not an accident: break patches in this repo edit
 * `apps/**` and `packages/**`, and suites live under `test/**`. If `scripts` is
 * ever added to `ROOTS`, this becomes load-bearing immediately — and so does
 * excluding `check-patch-guard.mjs`, which plants `// BROKEN:` fixtures on
 * purpose. The case file pins the scope so that widening it fails loudly rather
 * than turning the guard red on its own tooling.
 */
const SELF = path.join(REPO, 'scripts/check-no-break-patches.mjs')

const hits = []
let scanned = 0
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
      walk(full)
    } else if (EXT.test(entry.name) && path.resolve(full) !== SELF) {
      scanned += 1
      const lines = fs.readFileSync(full, 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const sig of SIGNATURES) {
          if (sig.re.test(line)) hits.push({ file: full, line: i + 1, text: line.trim(), why: sig.why })
        }
      })
    }
  }
}

const missing = ROOTS.filter((root) => !fs.existsSync(root))
for (const root of ROOTS) if (fs.existsSync(root)) walk(root)

// A ROOT THAT IS NOT THERE IS NOT A ROOT THAT IS CLEAN. This used to skip
// silently, which is how the whole scan could cover nothing.
if (missing.length) {
  console.error(
    `\n[break-patch-check] ${missing.length} of ${ROOTS.length} root(s) do not exist, so nothing ` +
      'in them was read:\n',
  )
  for (const m of missing) console.error(`  ${m}`)
  console.error(
    '\nThis script resolves its roots from its own location, so a missing root means the ' +
      'repository\nlayout has changed. Point it at the new one rather than letting it report a ' +
      'clean tree it\nnever opened.',
  )
  bail(1)
}

if (scanned < MIN_SCANNED) {
  console.error(
    `\n[break-patch-check] the scan read ${scanned} file(s), below the floor of ${MIN_SCANNED}. ` +
      'Every root\nexists, so this is the extension filter or the directory pruning having ' +
      'quietly narrowed:\n"no signatures found" in a scan this small is a statement about the ' +
      'scan, not about the tree.',
  )
  bail(1)
}

if (hits.length === 0) {
  console.log(
    `[break-patch-check] clean — ${scanned} file(s) read across apps, packages and test, ` +
      'no break-patch signatures in any of them',
  )
  bail(0)
}

console.error(`\n[break-patch-check] ${hits.length} break-patch signature(s) reached the tree:\n`)
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}`)
  console.error(`    ${h.text}`)
  console.error(`    ${h.why}\n`)
}
console.error(
  'These are edits written to make a check fail, not to ship. If one is here, a\n' +
    'break-test run was interrupted or swept into a commit. Restore the file from\n' +
    'the patch’s inverse — not from `git checkout`, which would take the real work\n' +
    'with it — and re-run the patch deliberately when the tree is quiet.\n',
)
process.exitCode = 1
