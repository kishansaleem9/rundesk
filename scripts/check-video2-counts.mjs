#!/usr/bin/env node
/*
 * The re-audit ledger's headline count has to agree with its own derivation.
 *
 * WHY THIS EXISTS. `docs/video2-reaudit.md` §4 opens with a sentence — "173
 * rows: 104 built · 20 partial · 49 missing" — and then shows the table that
 * produces it, under the words "so the number can be checked rather than
 * believed". For several passes the sentence read `88 built · 21 partial · 64
 * missing` while the table read 104 / 20 / 49. BOTH SUMMED TO 173, so the
 * disagreement was invisible at a glance: the total had been carried forward
 * when §5's forty-one rows were recovered, and the split had not.
 *
 * A count is the one thing in that file that gets quoted without being
 * checked. So it is checked here instead, mechanically, on every build.
 *
 * Three assertions, each catching a different way the number goes wrong:
 *
 *   1. the derivation adds up — the `consolidated` row is the arithmetic sum
 *      of the rows above it, column by column and in the total;
 *   2. the headline sentence repeats the `consolidated` row exactly — this is
 *      the failure that actually happened;
 *   3. §2's live table holds as many rows as §4 says it contributes. The
 *      SPLIT moves every time a row closes and that is the point of the work,
 *      so the split is deliberately not checked; the ROW COUNT only moves when
 *      scope changes, and a scope change that does not reach §4 is drift.
 *
 * Rows marked `—` in §2 are out of scope (see §3) or satisfied differently,
 * and are not counted — the same rule the table's own legend states.
 */
import { readFileSync } from 'node:fs'

const PATH = 'docs/video2-reaudit.md'
const doc = readFileSync(PATH, 'utf8')
const problems = []

const slice = (from, to) => {
  const a = doc.indexOf(from)
  const b = doc.indexOf(to)
  if (a < 0 || b < 0 || b <= a) return null
  return doc.slice(a, b)
}

/* `−6` is U+2212, not a hyphen — the table is written for readers. */
const num = (cell) => Number(cell.replace(/\*|\s/g, '').replace('−', '-'))

// ── 1 · the derivation adds up ─────────────────────────────────────────────
const four = slice('## 4. Counts', '## 5. Rows recovered')
if (!four) problems.push('§4 or §5 heading not found — the file has been restructured')

let consolidated = null
if (four) {
  const rows = four
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*-+/.test(l) && !/\|\s*B\s*\|\s*P\s*\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length === 5 && c.slice(1).every((v) => /^[*\s]*[+−-]?\d+[*\s]*$/.test(v)))

  const totals = rows.find((r) => /consolidated/i.test(r[0]))
  const parts = rows.filter((r) => !/consolidated/i.test(r[0]))

  if (!totals) problems.push('§4: no `consolidated` row in the counts table')
  else if (parts.length < 2) problems.push('§4: the counts table has no rows to consolidate')
  else {
    consolidated = totals.slice(1).map(num)
    const summed = [1, 2, 3, 4].map((i) => parts.reduce((a, r) => a + num(r[i]), 0))
    const label = ['B', 'P', 'M', 'total']
    summed.forEach((want, i) => {
      if (want !== consolidated[i]) {
        problems.push(
          `§4: the ${label[i]} column sums to ${want}, but the consolidated row says ` +
            `${consolidated[i]}. The rows above it are the derivation; one of them moved ` +
            'without the total following.',
        )
      }
    })
    if (consolidated[0] + consolidated[1] + consolidated[2] !== consolidated[3]) {
      problems.push(
        `§4: consolidated B+P+M is ${consolidated[0] + consolidated[1] + consolidated[2]}, ` +
          `but the total column says ${consolidated[3]}`,
      )
    }
  }
}

// ── 2 · the headline sentence repeats the consolidated row ─────────────────
if (four && consolidated) {
  const m = four.match(/\*\*(\d+) rows: (\d+) built · (\d+) partial · (\d+) missing\.\*\*/)
  if (!m) {
    problems.push(
      '§4: no headline sentence of the form ' +
        '`**<n> rows: <b> built · <p> partial · <m> missing.**` — that sentence is what gets ' +
        'quoted elsewhere, so it has to exist and it has to be checkable',
    )
  } else {
    const [, total, b, p, mm] = m.map(Number)
    const want = { total: consolidated[3], b: consolidated[0], p: consolidated[1], m: consolidated[2] }
    if (total !== want.total || b !== want.b || p !== want.p || mm !== want.m) {
      problems.push(
        `§4: the headline reads "${total} rows: ${b} built · ${p} partial · ${mm} missing" but ` +
          `its own table consolidates to ${want.total} rows: ${want.b} built · ${want.p} ` +
          `partial · ${want.m} missing. THIS IS THE FAILURE THE CHECK WAS WRITTEN FOR — both ` +
          'read plausibly and only one is derived.',
      )
    }
  }
}

// ── 3 · §2 contributes as many rows as §4 says it does ─────────────────────
const two = slice('## 2. What the frames show', '## 3. Deliberately out of scope')
if (!two) problems.push('§2 or §3 heading not found — the file has been restructured')
else if (four) {
  const counted = (two.match(/^\|\s*\*{0,2}(?:B\\?\*|B|P|M)\*{0,2}\s*\|/gm) ?? []).length
  const row = four
    .split('\n')
    .find((l) => /^\|\s*§2[,\s]/.test(l))
  const claimed = row ? num(row.split('|').slice(1, -1)[4]) : null
  if (claimed === null) problems.push('§4: no `§2, the sections table` row in the counts table')
  else if (counted !== claimed) {
    problems.push(
      `§2 holds ${counted} status rows (B / B* / P / M; \`—\` rows are out of scope and not ` +
        `counted), but §4 credits it with ${claimed}. A row was added to or removed from the ` +
        'sections table without §4 following. The split is deliberately not checked here — it ' +
        'moves every time a row closes, which is the work going well.',
    )
  }
}

if (problems.length) {
  console.error('[video2-counts] the ledger disagrees with itself:\n')
  for (const p of problems) console.error(`  · ${p}\n`)
  console.error(`Fix ${PATH} §4, or this number will be quoted as fact.`)
  process.exit(1)
}
console.log('[video2-counts] §4 adds up, its headline repeats it, and §2 contributes what §4 credits')
