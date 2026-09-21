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
 * Seven assertions, each catching a different way the number goes wrong:
 *
 *   1. the derivation adds up — the `consolidated` row is the arithmetic sum
 *      of the rows above it, column by column and in the total;
 *   2. the headline sentence repeats the `consolidated` row exactly — this is
 *      the failure that actually happened;
 *   3. §2's live table holds the rows AND the split §4 says it contributes.
 *      This once checked only the row count, excused with "the split moves
 *      every time a row closes, which is the work going well" — and the count
 *      never moves when a row merely closes, so it passed through twenty-six
 *      of them. A number that moves often is the one that most needs tying
 *      down, not the one to excuse;
 *   4. §5's three appendices sum to §5's own as-recovered headline;
 *   5. §5's as-recovered headline, plus the closures its reconciliation table
 *      records, equals what §4 credits §5 with;
 *   6. and §5's appendix ROWS — their own `- status:` lines — add up to that
 *      live split. Added after a row was closed and every number in the file
 *      stayed consistent and wrong, which is assertion 3's failure one
 *      section along: numbers that agree with each other are not numbers
 *      that agree with the rows.
 *
 * FOUR AND FIVE WERE ADDED AFTER THE SAME BUG CAME BACK. §4's table credited
 * §5 with `31 · 4 · 6` while §5's own heading read `15 · 5 · 21`. Both totalled
 * 41, so assertion 1 was satisfied and both numbers survived several readings —
 * the identical shape to the 173 that was two different numbers, which is what
 * this file was written for in the first place. Nothing was wrong with either
 * split: one was as-recovered and the other live, and the page never said so.
 * A true number that reads as a different claim is the stale reason, and it
 * costs exactly as much as a false one.
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

/**
 * Every `| label | B | P | M | total |` row in a slice, as `[label, …4 nums]`.
 *
 * Header and rule rows drop out because their cells are not numeric, which is
 * also why this is safe to point at a section containing prose tables: a table
 * of anything else simply contributes no rows.
 */
const numericRows = (text) =>
  text
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*-+/.test(l) && !/\|\s*B\s*\|\s*P\s*\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length === 5 && c.slice(1).every((v) => /^[*\s]*[+−-]?\d+[*\s]*$/.test(v)))

/**
 * Pull a B/P/M split out of a heading written for a human.
 *
 * The three appendices each phrase theirs differently — `B 11 · P 1 · M 5`,
 * `4 B · 2 P · 9 M`, `B 0 · P 2 · M 7` — and rewriting all three into one shape
 * would be this check editing the document to suit itself. So both orders are
 * accepted, per letter, and a letter that appears in neither order is reported
 * rather than defaulted to zero: a missing number must not read as a nought.
 */
const splitOf = (text) => {
  const out = {}
  for (const letter of ['B', 'P', 'M']) {
    const after = text.match(new RegExp(`\\b${letter}\\s*(\\d+)`))
    const before = text.match(new RegExp(`(\\d+)\\s*${letter}\\b`))
    out[letter] = after ? Number(after[1]) : before ? Number(before[1]) : null
  }
  return out
}

// ── 1 · the derivation adds up ─────────────────────────────────────────────
const four = slice('## 4. Counts', '## 5. Rows recovered')
if (!four) problems.push('§4 or §5 heading not found — the file has been restructured')

let consolidated = null
if (four) {
  const rows = numericRows(four)

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

// ── 3 · §2 contributes the rows AND the split §4 says it does ──────────────
/*
 * THE SPLIT IS CHECKED, AND IT DID NOT USE TO BE.
 *
 * This assertion originally compared the row COUNT only, with a comment saying
 * the split was left alone because "it moves every time a row closes, which is
 * the work going well". The count never moves when a row merely closes, so the
 * check passed for weeks while §4 went on crediting §2 with `79 · 12 · 42` and
 * §2 actually held `105 · 11 · 17` — twenty-six closures that never reached the
 * headline. The reasoning had it backwards: a number that moves often is the
 * one that most needs tying down, not the one to excuse.
 *
 * `B*` counts as built. The row is built; the asterisk records a remainder in
 * the row's own prose, and a count that dropped those four would disagree with
 * every other statement in the file about what is done.
 */
const two = slice('## 2. What the frames show', '## 3. Deliberately out of scope')
if (!two) problems.push('§2 or §3 heading not found — the file has been restructured')
else if (four) {
  const marks = (two.match(/^\|\s*\*{0,2}(B\\?\*|B|P|M)\*{0,2}\s*\|/gm) ?? []).map((m) =>
    /B/.test(m) ? 'B' : /P/.test(m) ? 'P' : 'M',
  )
  const live = {
    B: marks.filter((x) => x === 'B').length,
    P: marks.filter((x) => x === 'P').length,
    M: marks.filter((x) => x === 'M').length,
  }
  const row = four
    .split('\n')
    .find((l) => /^\|\s*§2[,\s]/.test(l))
  if (!row) problems.push('§4: no `§2, the sections table` row in the counts table')
  else {
    const cells = row.split('|').slice(1, -1)
    const claimed = { B: num(cells[1]), P: num(cells[2]), M: num(cells[3]), total: num(cells[4]) }
    const counted = marks.length
    if (counted !== claimed.total) {
      problems.push(
        `§2 holds ${counted} status rows (B / B* / P / M; \`—\` rows are out of scope and not ` +
          `counted), but §4 credits it with ${claimed.total}. A row was added to or removed from ` +
          'the sections table without §4 following.',
      )
    }
    /*
     * ASSERTION 7 — THE PROSE UNDER THE TABLE COUNTS TOO.
     *
     * The paragraph below §4's table reads "§2's N built includes the four
     * marked `B*`". It said 105 while the table said 112, and had done for
     * long enough that nobody knows when it stopped being true: the six
     * assertions above all check numbers that live in TABLES, and a number in
     * a sentence is quoted exactly as often and checked never. It is the same
     * defect as the headline that disagreed with its own derivation, which is
     * what assertion 2 exists for — one paragraph lower down.
     */
    const prose = four.match(/§2's\s+(\d+)\s+built includes/)
    if (!prose) {
      problems.push(
        "§4: the paragraph naming §2's built count (\"§2's N built includes the four marked `B*`\") " +
          'is gone. It is checked here because it is quoted as fact; if it was deleted on purpose, ' +
          'delete this assertion with it.',
      )
    } else if (num(prose[1]) !== claimed.B) {
      problems.push(
        `§4's table credits §2 with ${claimed.B} built and the paragraph under it says ` +
          `${num(prose[1])}. A sentence is quoted as often as a table and checked far less.`,
      )
    }
    for (const k of ['B', 'P', 'M']) {
      if (live[k] !== claimed[k]) {
        problems.push(
          `§2 holds ${live[k]} ${k} rows, but §4 credits it with ${claimed[k]}. A row changed ` +
            'status in §2 without §4 following — which is how §4 came to be adding a stale §2 ' +
            'split to a live §5 one and consolidating the result.',
        )
      }
    }
  }
}

// ── 4 · §5's three appendices sum to §5's own as-recovered headline ────────
const APPENDICES = [
  ['# Recovered ledger rows — S01–S08', '# Recovered rows — S09–S15'],
  ['# Recovered rows — S09–S15', '# Recovered rows — S16 through S22'],
  ['# Recovered rows — S16 through S22', '## 6. Rows in this file whose status is wrong'],
]

const five = slice('## 5. Rows recovered', APPENDICES[0][0])
let recovered = null
if (!five) problems.push('§5 heading or its first appendix not found — the file has been restructured')
else {
  const m = five
    .replace(/\s+/g, ' ')
    .match(/\*\*(\d+) rows recovered: (\d+) built · (\d+) partial · (\d+) missing/)
  if (!m) {
    problems.push(
      '§5: no `**<n> rows recovered: <b> built · <p> partial · <m> missing**` headline. It is the ' +
        'number the three appendices below have to add up to, so it has to exist.',
    )
  } else {
    const [, total, B, P, M] = m.map(Number)
    recovered = { B, P, M, total }
    if (B + P + M !== total) {
      problems.push(`§5: the headline's ${B} + ${P} + ${M} is ${B + P + M}, not the ${total} it claims`)
    }
  }
}

if (recovered) {
  const got = { B: 0, P: 0, M: 0 }
  let ok = true
  APPENDICES.forEach(([from, to], i) => {
    const body = slice(from, to)
    if (!body) {
      problems.push(`§5: appendix ${i + 1} ("${from}") not found between its neighbours`)
      ok = false
      return
    }
    const at = body.indexOf('\n## Counts')
    if (at < 0) {
      problems.push(`§5: appendix ${i + 1} ("${from}") has no "## Counts" block of its own`)
      ok = false
      return
    }
    const head = body.slice(at, at + 400)
    if (!/AS RECOVERED/.test(head)) {
      problems.push(
        `§5: appendix ${i + 1}'s count block does not say AS RECOVERED. It is a snapshot from when ` +
          'the pass ran, §4 is the live count, and a block that does not say which it is will be ' +
          'read as the other one — which is the drift this check exists for.',
      )
      ok = false
    }
    const s = splitOf(head)
    for (const k of ['B', 'P', 'M']) {
      if (s[k] === null) {
        problems.push(`§5: appendix ${i + 1}'s count block states no ${k} number`)
        ok = false
      } else got[k] += s[k]
    }
  })
  if (ok) {
    for (const k of ['B', 'P', 'M']) {
      if (got[k] !== recovered[k]) {
        problems.push(
          `§5: the three appendices' ${k} adds to ${got[k]}, but §5's as-recovered headline says ` +
            `${recovered[k]}. The appendices are the derivation of that headline; one moved without ` +
            'the other.',
        )
      }
    }
  }
}

// ── 5 · as recovered + closures = what §4 credits §5 with ──────────────────
if (five && recovered && four) {
  const rows = numericRows(five)
  const asRec = rows.find((r) => /as recovered/i.test(r[0]))
  const closed = rows.find((r) => /closed since/i.test(r[0]))
  const live = rows.find((r) => /live/i.test(r[0]))
  if (!asRec || !closed || !live) {
    problems.push(
      '§5: no reconciliation table with `as recovered` / `closed since` / `live` rows. Without it ' +
        "§5's split and §4's §5 row are two plausible numbers with nothing between them, which is " +
        'exactly how this went wrong.',
    )
  } else {
    const label = ['B', 'P', 'M', 'total']
    ;[1, 2, 3, 4].forEach((i) => {
      if (i < 4 && num(asRec[i]) !== recovered[label[i - 1]]) {
        problems.push(
          `§5: the reconciliation table's as-recovered ${label[i - 1]} is ${num(asRec[i])}, but the ` +
            `headline above it says ${recovered[label[i - 1]]}`,
        )
      }
      const sum = num(asRec[i]) + num(closed[i])
      if (sum !== num(live[i])) {
        problems.push(
          `§5: as-recovered ${num(asRec[i])} plus ${num(closed[i])} closed is ${sum}, but the ` +
            `table's live ${label[i - 1]} says ${num(live[i])}`,
        )
      }
    })

    const fiveRow = four.split('\n').find((l) => /^\|\s*§5[,\s]/.test(l))
    if (!fiveRow) problems.push('§4: no `§5, recovered from the frame observations` row')
    else {
      const cells = fiveRow.split('|').slice(1, -1)
      ;[1, 2, 3, 4].forEach((i) => {
        if (num(cells[i]) !== num(live[i])) {
          problems.push(
            `§4 credits §5 with ${label[i - 1]} ${num(cells[i])}, but §5's own reconciliation ends ` +
              `at ${num(live[i])}. THIS IS THE PAIR THAT DISAGREED — both totalled 41, so nothing ` +
              'caught it.',
          )
        }
      })
    }
  }
}

// ── 6 · §5's appendix ROWS add up to §5's live split ───────────────────────
/*
 * THE SAME BLIND SPOT ASSERTION 3 WAS WRITTEN FOR, one section along.
 *
 * Assertions 4 and 5 relate §5's numbers to each other and to §4. None of them
 * looks at the ROWS. So closing a row — changing its `- status: M` to
 * `- status: B` and adding a `closed by:` line — left every number in the file
 * consistent and every one of them wrong, and the build said nothing. That is
 * exactly what happened to §2's split for twenty-six closures, and the fix
 * there was to count. This counts.
 *
 * `- status:` is the row's own live word, the same field the appendices have
 * carried from the start. `B*` counts as built, as it does in §2.
 */
const FIRST_APPENDIX = '# Recovered ledger rows — S01–S08'
const AFTER_APPENDICES = '## 6. Rows in this file whose status is wrong'
const rowsRegion = slice(FIRST_APPENDIX, AFTER_APPENDICES)
if (!rowsRegion) problems.push('§5: the appendix range could not be sliced — the file has been restructured')
else if (five) {
  const counted = { B: 0, P: 0, M: 0 }
  for (const [, word] of rowsRegion.matchAll(/^- status: (B\*?|P|M)$/gm)) {
    counted[word === 'B*' ? 'B' : word] += 1
  }
  const total = counted.B + counted.P + counted.M
  const rows = numericRows(five)
  const live = rows.find((r) => /live/i.test(r[0]))
  if (!live) problems.push('§5: no `live` row to count the appendix rows against')
  else {
    const label = ['B', 'P', 'M']
    label.forEach((k, i) => {
      if (counted[k] !== num(live[i + 1])) {
        problems.push(
          `§5's appendix rows carry ${counted[k]} \`- status: ${k}\` between them, but the ` +
            `reconciliation table's live ${k} says ${num(live[i + 1])}. A row was closed (or opened) ` +
            'without the split following — the failure assertion 3 exists for, one section along.',
        )
      }
    })
    if (total !== num(live[4])) {
      problems.push(`§5 holds ${total} rows with a status, but its live total says ${num(live[4])}`)
    }
  }
}

if (problems.length) {
  console.error('[video2-counts] the ledger disagrees with itself:\n')
  for (const p of problems) console.error(`  · ${p}\n`)
  console.error(`Fix ${PATH} §4, or this number will be quoted as fact.`)
  process.exit(1)
}
console.log(
  "[video2-counts] §4 adds up, its headline repeats it, §2 contributes the rows and split §4 " +
    "credits, the paragraph under the table agrees with the table, §5's appendices add to its " +
    "as-recovered headline, that reconciles to §4, and §5's rows add up to it",
)
