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

const ROOTS = ['apps', 'packages', 'test']
const EXT = /\.(ts|tsx|mjs|js|jsx|css|sql)$/

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
const SELF = path.resolve('scripts/check-no-break-patches.mjs')

const hits = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
      walk(full)
    } else if (EXT.test(entry.name) && path.resolve(full) !== SELF) {
      const lines = fs.readFileSync(full, 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const sig of SIGNATURES) {
          if (sig.re.test(line)) hits.push({ file: full, line: i + 1, text: line.trim(), why: sig.why })
        }
      })
    }
  }
}

for (const root of ROOTS) if (fs.existsSync(root)) walk(root)

if (hits.length === 0) {
  console.log('[break-patch-check] clean — no break-patch signatures in apps, packages or test')
  process.exit(0)
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
process.exit(1)
