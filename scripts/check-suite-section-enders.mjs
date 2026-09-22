#!/usr/bin/env node
/*
 * THE TWO INTERACTIONS THAT END A SECTION INSTEAD OF REPORTING.
 *
 * RULE ONE — A PRESS ON A CONTROL THE CHECK ABOVE IT IS ALLOWED TO FIND ABSENT.
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
 * RULE TWO — A GATE ON AN ELEMENT SOME CHECK IN THE SAME SUITE IS ABOUT.
 *
 *     await page.waitForSelector('[data-testid="create-search"]', { timeout: 20_000 })
 *     …
 *     chk((await …getByTestId('create-search').getAttribute('placeholder')) === …)
 *
 * `cma-16-no-search-box` renames that testid — which is the check it claims —
 * and the gate threw twenty seconds later, before one check had run. 4 of 24
 * reported. A gate whose element nothing asserts is a legitimate page-load wait
 * and is left alone; there are 61 of those and they are not this. The five that
 * stood in front of their own check are the whole finding, which is the same
 * ratio the press rule had: precise because the pairing is the suite's own.
 *
 * AND A THIRD RULE THAT IS NOT A GATE, on purpose.
 *
 * The real lesson of `list-view-controls-42-empty-group-no-add` is that its
 * press had been bounded FOR IT, by name, in a comment — and the run still
 * ended at 45 of 50, on the `fill` underneath. Bounding one step of a sequence
 * and leaving the next alone moves the thirty seconds one line down.
 *
 * I wrote that as a rule — "an interaction under something that is allowed to
 * fail" — and it found thirty real sites across twenty suites, every one of
 * which is now bounded. It is still not a gate, because it cannot be stated
 * without reading FORMATTING: whether a call counts as bounded depends on how
 * many lines it is written across, and each fix makes the next line a new site,
 * so it converges by cascade rather than by being right. Two window sizes gave
 * two different answers about the same tree, and at that point the rule was
 * being tuned against its own output rather than against the defect.
 *
 * The two rules above pair an interaction with a CHECK about the same element,
 * which is the suite's own statement rather than a guess about layout. Those
 * gate. The sequence shape is caught where it has always been caught: every
 * instance shortens a run, and `EXPECTED_CHECKS` being exact turns that into a
 * row that gates.
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

// RULE TWO. Every testid any `chk` in the suite is about, against every
// `waitForSelector` on one of them that cannot fail without throwing.
let gates = 0
for (const file of readdirSync(SUITES).filter((f) => f.endsWith('.mjs')).sort()) {
  const lines = readFileSync(join(SUITES, file), 'utf8').split('\n')
  const checked = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*chk\(/.test(lines[i])) continue
    for (const m of lines
      .slice(i, i + 5)
      .join(' ')
      .matchAll(/getByTestId\(['`]([^'`]+)['`]\)|\bvisible\(['`]([^'`]+)['`]\)/g))
      checked.add(m[1] ?? m[2])
  }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/waitForSelector\(\s*['`]\[data-testid="([^"]+)"\]/)
    if (!m || /catch/.test(lines[i])) continue
    if (!checked.has(m[1])) continue // a page-load gate on something nothing asserts
    gates += 1
    rows.push({ file, line: i + 1, id: m[1], text: lines[i].trim(), gate: true })
  }
}

for (const r of rows) {
  console.log(`  ${r.file}:${r.line}  ${r.id}${r.gate ? '  (gate)' : ''}`)
  console.log(`      ${r.text.slice(0, 120)}`)
}
console.log(
  `[section-enders] ${rows.length - gates} press(es) on a control the check above them may find ` +
    `absent, and ${gates} gate(s) in front of a check about the same element, across ` +
    `${new Set(rows.map((r) => r.file)).size} suite(s)`,
)
if (rows.length) {
  console.error(
    '\n[section-enders] Bound and catch each one — `.click({ timeout: 10_000 }).catch(() => {})` for a\n' +
      'press, `.catch(() => {})` for a gate — so the checks below report what happened instead of\n' +
      'being replaced by a thirty-second exception.',
  )
  process.exit(1)
}
