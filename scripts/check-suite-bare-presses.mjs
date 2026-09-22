#!/usr/bin/env node
/*
 * A PRESS ON A CONTROL THE CHECK ABOVE IT IS ALLOWED TO FIND ABSENT.
 *
 * The shape, and it cost more than any other single thing in this sweep:
 *
 *     chk(await visible('list-empty-clear-filters'), 'there is a control to clear', …)
 *     await page.getByTestId('list-empty-clear-filters').click()
 *
 * When that check fails — which is the entire purpose of the break patch that
 * makes it fail — the press waits Playwright's default thirty seconds, throws,
 * and the throw ends the section. `list-empty-states-2-same-copy` removes the
 * undo control and reported 14 of 23 checks. `imports-3-deadpreset` leaves Start
 * disabled and reported 7 of 19: twelve checks about what the import wrote,
 * silenced by one click, under a row crediting the patch with the one reddening
 * it claims.
 *
 * WHY THIS ONE GETS A CHECKER WHEN THE READS DID NOT. The same scan over
 * `innerText` and `getAttribute` found nine candidates and SIX were already
 * guarded — by `&&` short-circuiting, which is the idiom these suites use and
 * which a text rule cannot see. Six working call sites reported as defects is a
 * checker nobody would keep. A bare standalone `await X.click()` has no
 * short-circuit to hide behind: all nineteen found this way were real, and the
 * fix is mechanical because catching a press changes no verdict — no check
 * asserts that a click succeeded, they assert the state after it.
 *
 * WHAT COUNTS AS GUARDED: a `timeout:` on the click (it still throws, but in
 * seconds rather than half a minute) or a `.catch(`. Both are in the tree
 * already; `ai-action-categories.mjs` carries `click({ timeout: 20_000 })
 * .catch(() => {})` and that is the line this check points at.
 *
 * Exit 1 with every site named.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SUITES = new URL('../test/e2e', import.meta.url).pathname
// How far below a check a press is still "the press that check is about". Ten
// lines covers a chk spanning its three arguments plus a comment; beyond that
// the two are about different things and the pairing would be a guess.
const WINDOW = 10

const rows = []
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const lines = readFileSync(join(SUITES, file), 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*chk\(/.test(lines[i])) continue
    // The condition, which may run over the next few lines before the message.
    const cond = lines.slice(i, i + 4).join(' ')
    // Only checks that ask whether something EXISTS. A check about a value can
    // fail with the element perfectly present, and a press after it is fine.
    if (!/\.count\(\)|isVisible|visible\(|waitUntil/.test(cond)) continue
    const ids = [
      ...cond.matchAll(/getByTestId\(['`]([^'`]+)['`]\)|\bvisible\(['`]([^'`]+)['`]\)/g),
    ].map((m) => m[1] ?? m[2])
    if (!ids.length) continue
    for (let j = i + 1; j < Math.min(i + 1 + WINDOW, lines.length); j++) {
      const line = lines[j]
      if (/catch|timeout/.test(line)) continue
      for (const id of new Set(ids)) {
        const quoted = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (!new RegExp(`getByTestId\\(['\`]${quoted}['\`]\\)[^\\n]*\\.click\\(\\)`).test(line)) continue
        rows.push({ file, line: j + 1, id, text: line.trim() })
      }
    }
  }
}

for (const r of rows) {
  console.log(`  ${r.file}:${r.line}  ${r.id}`)
  console.log(`      ${r.text.slice(0, 120)}`)
}
console.log(
  `[bare-presses] ${rows.length} press(es) on a control the check above them may find absent, ` +
    `across ${new Set(rows.map((r) => r.file)).size} suite(s)`,
)
if (rows.length) {
  console.error(
    '\n[bare-presses] Bound and catch each one — `.click({ timeout: 10_000 }).catch(() => {})` — so the\n' +
      'checks below it report what happened instead of being replaced by a thirty-second exception.',
  )
  process.exit(1)
}
