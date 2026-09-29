#!/usr/bin/env node
/*
 * A CHECK THAT SAYS TEXT IS SHOWN DOES NOT READ IT WITH `textContent`
 * (the ledger's `checks-read-textContent-not-what-is-shown`, a found-23-sep
 * item — cited without its section because `check-ledger-ids.mjs` reads an id
 * as lowercase, and this one has a capital C).
 *
 * `textContent` is every character in an element, drawn or not: text inside
 * `hidden`, `display: none` or a closed `<details>` reads exactly as if it
 * were on the screen. `hr-9` wraps Home's reminders empty state in
 * `<div hidden>` — a blank panel to anybody looking — and `home-reminders`
 * stayed green, because its check read "No reminders waiting" out of the
 * hidden div.
 *
 * MEASURED FIRST, 29 September, comments stripped: 69 `textContent` /
 * `allTextContents` reads in 28 suites. (The ledger's `grep -l
 * 'textContent('` saw 17 files: most of these are property reads in page code
 * and `allTextContents()` calls.) 55 fed a check that text IS SHOWN — in the
 * condition itself, or through a helper, a variable or the `waitUntil` in
 * front of it. One more, `task-menu`'s printed id, is read out of a copy that
 * is hidden on screen by design. 13 asserted no showing at all: 7 in a
 * check's message, 1 in a variable only a message uses, 4 reading a row's
 * text to FIND the row, 1 asserting ABSENCE — where reading hidden text too is
 * the stricter read, not the weaker one.
 *
 * AND `innerText` ALONE IS NOT THE FIX, which had to be measured rather than
 * assumed. In the lanes' Chromium:
 *
 *     <section id=panel>Reminders<div hidden><p id=msg>No reminders</p></div></section>
 *
 *     panel.textContent  "RemindersNo reminders"   panel.innerText  "Reminders"
 *     msg.textContent    "No reminders"            msg.innerText    "No reminders"
 *
 * `innerText` leaves out hidden text INSIDE an element that is drawn — the
 * hr-9 shape, because `home-reminders` reads the panel — but an element that
 * is not drawn has no rendering to consult, and the spec answers with its
 * whole text. Most of the 55 read the element itself (a count, a label, a
 * chip), and `allInnerTexts()` over a list returns a hidden row's text too.
 * What closes it is a visibility check ON THE ELEMENT READ —
 * `.filter({ visible: true })` on its locator, `checkVisibility()` in page
 * code — and then `innerText` for anything hidden inside it.
 *
 * THE RULE. Every `textContent` / `allTextContents` read in a suite is one of:
 *
 *   · in a check's MESSAGE — the second argument onward of `chk(`, `check(`
 *     or a chain's `.step(` — or in a variable that only messages use. A
 *     message decides nothing;
 *   · VISIBILITY-GUARDED on the read itself: `.filter({ visible: true })`,
 *     `:visible` or `visible=true` on the locator it reads (followed to the
 *     locator's declaration when it is held in a variable), or
 *     `checkVisibility()` in the page code that reads it;
 *   · EXEMPT, by `// text-read: <reason>` at the end of its own line, the
 *     reason one of `absence`, `key`, `detail`, `not-rendered`.
 *
 * WHY EVERY READ, NOT ONLY "A READ IN A CONDITION": most of the 55 were not
 * in the condition. They were in a helper (`labels()`, `stat(id)`,
 * `rowNames(page)`), a variable read lines earlier, or the `waitUntil` that
 * decides when the condition is read — and following a value from a helper
 * through a call into a condition is a parser's job, not a regex's. So the
 * question is asked the other way round: a read passes where it provably
 * decides nothing, where it provably reads what is drawn, or where somebody
 * wrote down why. Six markers on this tree: `key` four times, `absence` and
 * `not-rendered` once each.
 *
 * A MARKER GOES ON THE READ'S OWN LINE, AND NEVER INSIDE A CHECK'S ARGUMENTS.
 * The other gates split a check's arguments on text (`topLevelArgs`, in
 * `lib/suite-reads.mjs`), and that splitter does not know a comment: a marker
 * written inside a condition while this file was being written had an
 * apostrophe in it, which opened a "string" there and moved every argument
 * after it. A read that needs a marker inside a check is hoisted into a
 * variable first. A marker with an unknown reason, or one that exempts
 * nothing on its line, is a failure as well — exemptions are meant to stay few.
 *
 * READ AS JAVASCRIPT, NOT AS LINES: comments, strings, regex literals and
 * template text are blanked before anything is matched, so `textContent` in a
 * sentence or a comment is not a read and a `)` in a string does not close a
 * call. A suite that does not lex to a clean end is reported, not guessed at.
 *
 * A GATE THAT READ NOTHING ANSWERS ok AS SURELY AS ONE THAT READ EVERYTHING:
 * fewer than 100 suites read is a failure (1 under `SUITE_DIR`).
 *
 * `--mutate` plants suites in a temp directory — the hr-9 read among them —
 * requires every violating shape to be caught and every fixed form to pass,
 * then breaks this file one rule at a time and requires a planted case to
 * notice (`lib/mutate.mjs`).
 *
 *   node scripts/check-suite-text-reads.mjs [--mutate]
 */
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const SELF = fileURLToPath(import.meta.url)
const SUITES = process.env.SUITE_DIR ?? join(dirname(SELF), '..', 'test', 'e2e')
const MIN_SUITES = process.env.SUITE_DIR ? 1 : 100
const REASONS = ['absence', 'key', 'detail', 'not-rendered']
const GUARD = /\.filter\(\s*\{\s*visible\s*:\s*true\s*\}\s*\)|:visible\b|\bvisible=true\b|\bcheckVisibility\s*\(/
const READ = /\.(textContent|allTextContents)\b/g
const EVALUATES = /^(?:evaluate|evaluateAll|evaluateHandle|\$eval|\$\$eval|waitForFunction)$/
const CHECKS = /(?<![.\w$])(?:chk|check)\s*\(|\.step\s*\(/g
const MARKER = /\/\/\s*text-read:\s*([\w-]*)/g
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'await', 'yield'])

/*
 * Two views of `src`, each exactly as long, so an index means the same place
 * in both: `code`, with comments, string and regex contents and template text
 * blanked (a bracket or a comma there is text, not syntax), and `bare`, with
 * only the comments blanked (a `:visible` in a selector string is a guard).
 * `clean` says whether the walk ended outside every string and comment.
 */
export function lex(src) {
  const code = src.split('')
  const bare = src.split('')
  // Newlines survive in comments and strings, so a line is still a line; in
  // template text they go too, so a wrapped sentence does not end a statement.
  const blank = (arr, i, keepNewline = true) => {
    if (i < arr.length && !(keepNewline && arr[i] === '\n')) arr[i] = ' '
  }
  const frames = [] // brace depth inside each open `${`
  let mode = 'code'
  let quote = ''
  let inClass = false
  let prev = ''
  let word = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const n = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && (n === '/' || n === '*')) {
        mode = n === '/' ? 'line' : 'block'
        blank(code, i), blank(bare, i), blank(code, i + 1), blank(bare, i + 1)
        i += 1
        continue
      }
      if (/\s/.test(c)) continue
      if (c === "'" || c === '"') {
        mode = 'string'
        quote = c
        continue
      }
      if (c === '`') {
        mode = 'template'
        continue
      }
      // A `/` after a value divides; anywhere else it opens a regex literal.
      if (c === '/' && (prev === '' || (/[\w$]/.test(prev) ? KEYWORDS.has(word) : !/[)\]'"`]/.test(prev)))) {
        mode = 'regex'
        inClass = false
        continue
      }
      if (c === '{' && frames.length) frames[frames.length - 1] += 1
      if (c === '}' && frames.length) {
        if (frames[frames.length - 1] === 0) {
          frames.pop()
          mode = 'template'
          continue
        }
        frames[frames.length - 1] -= 1
      }
      word = /[\w$]/.test(c) ? (/[\w$]/.test(src[i - 1] ?? '') ? word + c : c) : ''
      prev = c
    } else if (mode === 'line') {
      if (c === '\n') mode = 'code'
      else blank(code, i), blank(bare, i)
    } else if (mode === 'block') {
      blank(code, i), blank(bare, i)
      if (c === '*' && n === '/') {
        blank(code, i + 1), blank(bare, i + 1)
        i += 1
        mode = 'code'
      }
    } else if (mode === 'string') {
      if (c === '\\') {
        blank(code, i), blank(code, i + 1)
        i += 1
      } else if (c === quote || c === '\n') {
        mode = 'code'
        if (c === quote) prev = c
        word = ''
      } else blank(code, i)
    } else if (mode === 'template') {
      if (c === '\\') {
        blank(code, i, false), blank(code, i + 1, false)
        i += 1
      } else if (c === '`') {
        mode = 'code'
        prev = c
        word = ''
      } else if (c === '$' && n === '{') {
        frames.push(0)
        mode = 'code'
        prev = '{'
        word = ''
        i += 1
      } else blank(code, i, false)
    } else if (mode === 'regex') {
      if (c === '\\') {
        blank(code, i), blank(code, i + 1)
        i += 1
      } else if (c === '\n') mode = 'code'
      else if (inClass) {
        if (c === ']') inClass = false
        blank(code, i)
      } else if (c === '[') {
        inClass = true
        blank(code, i)
      } else if (c === '/') {
        mode = 'code'
        prev = ')' // a regex literal is a value: a `/` after it divides
        word = ''
      } else blank(code, i)
    }
  }
  return { code: code.join(''), bare: bare.join(''), clean: mode === 'code' && frames.length === 0 }
}

const CLOSE = { '(': ')', '[': ']', '{': '}' }
const OPEN = { ')': '(', ']': '[', '}': '{' }
const matchForward = (code, o) => {
  let d = 0
  for (let k = o; k < code.length; k++) {
    if (code[k] === code[o]) d += 1
    else if (code[k] === CLOSE[code[o]] && --d === 0) return k
  }
  return -1
}
const matchBack = (code, j) => {
  let d = 0
  for (let k = j; k >= 0; k--) {
    if (code[k] === code[j]) d += 1
    else if (code[k] === OPEN[code[j]] && --d === 0) return k
  }
  return -1
}
const argSpans = (code, open, close) => {
  const spans = []
  let d = 0
  let start = open + 1
  for (let k = open + 1; k < close; k++) {
    if ('([{'.includes(code[k])) d += 1
    else if (')]}'.includes(code[k])) d -= 1
    else if (code[k] === ',' && d === 0) {
      spans.push([start, k])
      start = k + 1
    }
  }
  spans.push([start, close])
  return spans
}

/*
 * Where a statement that starts at `from` ends: `;`, a closing bracket it did
 * not open, or a newline nothing carries on over — a line ending in an
 * operator, or a next line starting with `.`, `?`, `:`, `&&`, `||` or `,`,
 * which is how every wrapped chain and ternary in these suites is written.
 */
const statementEnd = (code, from) => {
  let d = 0
  let last = ''
  for (let k = from; k < code.length; k++) {
    const c = code[k]
    if (c === '\n' && d === 0) {
      let j = k + 1
      while (j < code.length && /\s/.test(code[j])) j++
      if (!/[=(\[{,?:&|+\-*/.<>!]/.test(last) && !/[.?:&|+*,=]/.test(code[j] ?? '')) return k
      continue
    }
    if (/\s/.test(c)) continue
    if ('([{'.includes(c)) d += 1
    else if (')]}'.includes(c)) {
      if (d === 0) return k
      d -= 1
    } else if (c === ';' && d === 0) return k
    last = c
  }
  return code.length
}

/*
 * Where the member chain that the `.` at `dot` continues begins — for the `.`
 * of `.textContent(`, the start of `page.getByTestId('x').filter({ visible:
 * true })` before it — across lines, calls, indexes and optional chaining.
 */
const chainStart = (code, dot) => {
  let i = dot
  for (;;) {
    let j = i - 1
    if (code[j] === '?') j -= 1
    while (j >= 0 && /\s/.test(code[j])) j--
    while (j >= 0 && (code[j] === ')' || code[j] === ']')) {
      const o = matchBack(code, j)
      if (o < 0) return 0
      j = o - 1
      if (code[j] === '.' && code[j - 1] === '?') j -= 2
      if (!/[\w$)\]]/.test(code[j] ?? '')) return o // `(await x).…` — the group starts the chain
    }
    let k = j
    while (k >= 0 && /[\w$]/.test(code[k])) k--
    let q = k
    while (q >= 0 && /\s/.test(code[q])) q--
    if (code[q] === '?' && code[q + 1] === '.') q += 1
    if (code[q] === '.' && code[q - 1] !== '.') {
      i = q
      continue
    }
    return k + 1
  }
}

/** Every read in one suite, what each one is, and every marker. */
export function readsIn(src) {
  const { code, bare, clean } = lex(src)
  const lineOf = (i) => src.slice(0, i).split('\n').length
  const calls = []
  for (const m of code.matchAll(CHECKS)) {
    const open = m.index + m[0].length - 1
    const close = matchForward(code, open)
    if (close > 0) calls.push({ open, close, args: argSpans(code, open, close) })
  }
  // Which argument of the innermost check call around `p` holds it — null
  // outside every check.
  const inCheck = (p) => {
    const call = calls.filter((c) => c.open < p && p < c.close).sort((a, b) => b.open - a.open)[0]
    return call ? call.args.findIndex(([a, b]) => p >= a && p <= b) : null
  }
  const decls = [...code.matchAll(/(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?![=>])/g)].map((m) => ({
    name: m[1],
    at: m.index,
    from: m.index + m[0].length,
    to: statementEnd(code, m.index + m[0].length),
  }))
  const declOf = (name, before) =>
    decls.filter((d) => d.name === name && d.at < before).sort((a, b) => b.at - a.at)[0] ??
    decls.find((d) => d.name === name)
  const isFunction = (d) =>
    /^\s*(?:async\b\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|^\s*(?:async\s+)?function\b/.test(code.slice(d.from, d.to))
  // A value only messages use: every other mention of its name is in a check's message.
  const onlyMessages = (d) => {
    const uses = [...code.matchAll(new RegExp(`(?<![\\w$.])${d.name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))]
      .map((m) => m.index)
      .filter((u) => u < d.at || u >= d.to)
    return uses.every((u) => (inCheck(u) ?? 0) >= 1)
  }
  // Where a guard can be written: the chain the read belongs to, and — when
  // that chain starts at a variable declared in this file — its declaration.
  const guardText = (start, end) => {
    let text = bare.slice(start, end)
    const root = code.slice(start, end).match(/^\s*([A-Za-z_$][\w$]*)/)?.[1]
    const d = root && declOf(root, start)
    if (d && !(d.from <= start && start < d.to)) text += ` ${bare.slice(d.from, d.to)}`
    return text
  }

  const reads = []
  for (const m of code.matchAll(READ)) {
    const dot = m.index
    const after = code.slice(dot + m[0].length).match(/^\s*(\(|=(?!=))?/)[1]
    if (after === '=') continue // a write: `el.textContent = …`
    const read = { line: lineOf(dot), verb: after === '(' ? `${m[1]}()` : `.${m[1]}` }
    const k = inCheck(dot)
    if (k !== null && k >= 1) read.kind = 'message'
    else if (k === null) {
      const d = decls.filter((x) => x.from <= dot && dot < x.to).sort((a, b) => b.from - a.from)[0]
      if (d && !isFunction(d) && onlyMessages(d)) read.kind = 'message-only'
    }
    if (!read.kind) {
      let text = ''
      if (after === '(') {
        text = guardText(chainStart(code, dot), matchForward(code, code.indexOf('(', dot)) + 1)
      } else {
        // In page code: the evaluate-family call around it, receiver and callback both.
        let depth = 0
        for (let o = dot - 1; o >= 0 && !text; o--) {
          if (code[o] === ')') depth += 1
          else if (code[o] === '(' && depth > 0) depth -= 1
          else if (code[o] === '(') {
            const callee = code.slice(Math.max(0, o - 40), o).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1] ?? ''
            if (!EVALUATES.test(callee)) continue
            const member = code.slice(Math.max(0, o - 60), o).match(/\.\s*[A-Za-z_$][\w$]*\s*$/)
            const start = member ? chainStart(code, Math.max(0, o - 60) + member.index) : o - callee.length
            text = guardText(start, matchForward(code, o) + 1)
          }
        }
        if (!text) text = bare.slice(src.lastIndexOf('\n', dot) + 1, src.indexOf('\n', dot) >>> 0)
      }
      if (GUARD.test(text)) read.kind = 'guarded'
    }
    reads.push(read)
  }

  const markers = []
  for (const m of src.matchAll(MARKER)) {
    if (bare[m.index] !== ' ') continue // `// text-read:` inside a string is not a comment
    markers.push({ line: lineOf(m.index), reason: m[1], inCheck: inCheck(m.index) !== null })
  }
  return { reads, markers, clean }
}

/** The gate over one directory: every problem, and a tally of what was read. */
export function scan(dir) {
  const problems = []
  const tally = { reads: 0, suites: 0, message: 0, 'message-only': 0, guarded: 0, exempt: {} }
  let files = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
  } catch {
    files = []
  }
  if (files.length < MIN_SUITES) {
    problems.push(
      `only ${files.length} suite(s) read under ${dir}, below the floor of ${MIN_SUITES} — a scan that reads ` +
        'nothing passes, so the zero needs a denominator',
    )
  }
  for (const file of files) {
    const { reads, markers, clean } = readsIn(readFileSync(join(dir, file), 'utf8'))
    if (!clean) {
      problems.push(`${file}  could not be read as JavaScript — it ends inside a string, comment or template, so any answer about it would be a guess`)
      continue
    }
    if (reads.length) tally.suites += 1
    tally.reads += reads.length
    const byLine = new Map(markers.map((mk) => [mk.line, mk]))
    for (const r of reads) {
      if (r.kind) {
        tally[r.kind] += 1
        continue
      }
      const mk = byLine.get(r.line)
      if (mk && REASONS.includes(mk.reason) && !mk.inCheck) {
        tally.exempt[mk.reason] = (tally.exempt[mk.reason] ?? 0) + 1
        mk.used = true
      } else if (!mk) {
        problems.push(`${file}:${r.line}  ${r.verb} — reads hidden text as if it were shown, and nothing on the read says otherwise`)
      }
      // A marker that is there and cannot exempt is reported once, on its own line, below.
    }
    for (const mk of markers) {
      if (mk.inCheck) {
        problems.push(
          `${file}:${mk.line}  // text-read: ${mk.reason} — inside a check's arguments, where the other gates split on text ` +
            'and a comment moves the split; hoist the read into a variable and mark that line',
        )
      } else if (!REASONS.includes(mk.reason)) {
        problems.push(`${file}:${mk.line}  // text-read: ${mk.reason} — not a reason this gate knows (${REASONS.join(', ')})`)
      } else if (!mk.used) {
        problems.push(`${file}:${mk.line}  // text-read: ${mk.reason} — exempts nothing: no read on this line needs it`)
      }
    }
  }
  return { problems, tally, suites: files.length }
}

function report({ problems, tally, suites }) {
  if (problems.length) {
    for (const p of problems) console.log(`✗ ${p}`)
    console.error(
      `\n[text-reads] ${problems.length} problem(s). A check that says text is SHOWN has to read what is drawn:\n` +
        'put the visibility check on the element read — `.filter({ visible: true })` on its locator, or\n' +
        '`checkVisibility()` in page code — and read `innerText` for anything hidden inside it. `innerText`\n' +
        'alone is not enough: an element that is itself hidden gives back its whole text. Keep `textContent`\n' +
        'behind the filter where `innerText` would change the words (`uppercase` labels, `<option>`s).\n' +
        'A read that asserts nothing about showing ends its line with `// text-read: <reason>`, one of\n' +
        `${REASONS.join(', ')} — outside any check's arguments.`,
    )
    process.exitCode = 1
    return false
  }
  const exempt = Object.entries(tally.exempt).sort()
  console.log(
    `[text-reads] ok — ${tally.reads} textContent read(s) in ${tally.suites} of ${suites} suite(s), none resting a ` +
      `check that text is shown on text that may be hidden: ${tally.message} in a check's message, ` +
      `${tally['message-only']} in a variable only messages use, ${tally.guarded} behind a visibility guard, ` +
      `${exempt.reduce((n, [, v]) => n + v, 0)} exempt${exempt.length ? ` (${exempt.map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`,
  )
  return true
}

/*
 * THE PLANTED SUITES. Each gets a directory of its own, and the gate — this
 * file, or under `--mutate` a broken copy of it — runs over it as a child,
 * exactly as it runs over `test/e2e`.
 */
const HR9 = [
  "const panel = page.getByTestId('home-section-reminders')",
  "const empty = await page.getByTestId('home-reminders-empty').textContent({ timeout: 5000 }).catch(() => null)",
  "chk(/no reminders/i.test(empty ?? ''), 'and with none left, the panel says there are none', `it read ${empty}`)",
].join('\n')
const CASES = [
  ['caught', 'the hr-9 read: a hidden empty state read with textContent', { 'home-reminders.mjs': HR9 }, /✗ home-reminders\.mjs:2 {2}textContent\(\)/],
  ['passes', 'the same suite fixed: filtered to visible, read with innerText', { 'home-reminders.mjs': HR9.replace('.textContent({', '.filter({ visible: true }).innerText({') }],
  ['passes', 'or kept as textContent behind the filter, where innerText would change the words', { 'menu.mjs': HR9.replace('.textContent({', '.filter({ visible: true }).textContent({') }],
  ['caught', 'a read at the head of a condition', { 'c.mjs': "chk((await page.getByTestId('t').textContent()) === 'Create', 'headed Create')" }, /✗ c\.mjs:1 {2}textContent\(\)/],
  ['caught', 'a list read inside a helper the condition calls', { 'c.mjs': "const labels = () => page.getByTestId('l').allTextContents()\nchk((await labels()).includes('a'), 'a is listed')" }, /✗ c\.mjs:1 {2}allTextContents\(\)/],
  ['caught', 'a property read in page code', { 'c.mjs': "const w = await page.locator('[data-testid^=\"w-\"]').evaluateAll((els) => els.map((e) => e.textContent))\nchk(w.length === 3, 'three words')" }, /✗ c\.mjs:1 {2}\.textContent/],
  ['caught', 'a variable a message uses AND the condition', { 'c.mjs': "const t = await page.getByTestId('x').textContent()\nchk(t === 'a', 'it says a', `it said ${t}`)" }, /✗ c\.mjs:1 /],
  ['caught', 'a guard on another statement, not on the read', { 'c.mjs': "const shown = page.getByTestId('x').filter({ visible: true })\nconst t = await page.getByTestId('x').textContent()\nchk(t === 'a', 'it says a')" }, /✗ c\.mjs:2 /],
  ['caught', 'a marker with a reason nobody defined', { 'c.mjs': "const t = await page.getByTestId('x').textContent() // text-read: because\nchk(t === 'a', 'it says a')" }, /not a reason this gate knows/],
  ['caught', 'a marker that exempts nothing', { 'c.mjs': "const t = await page.getByTestId('x').innerText() // text-read: key\nchk(t === 'a', 'it says a')" }, /exempts nothing/],
  ['caught', "a marker inside a check's arguments", { 'c.mjs': "chk(\n  (await page.getByTestId('x').textContent()) === 'a', // text-read: key\n  'it says a',\n)" }, /inside a check's arguments/],
  ['caught', 'a directory with no suites in it', { 'README.md': 'nothing' }, /below the floor/],
  ['passes', 'a read in a check message', { 'c.mjs': "chk(await visible('x'), 'x is there', `it read ${await page.getByTestId('x').textContent().catch(() => null)}`)" }],
  ['passes', 'a variable only a message uses', { 'c.mjs': "const now = await page.getByTestId('x').textContent().catch(() => null)\nchk(ok, 'the chip moved', `the chip read ${now}`)" }],
  ['passes', 'page code that checks visibility first', { 'c.mjs': "const w = await page.locator('li').evaluateAll((els) => els.filter((e) => e.checkVisibility()).map((e) => e.textContent))\nchk(w.length === 3, 'three')" }],
  ['passes', 'a guard on a locator held in a variable', { 'c.mjs': "const note = page.getByTestId('n').filter({ visible: true })\nchk((await note.textContent()) === 'a', 'it says a')" }],
  ['passes', 'a read marked with a reason', { 'c.mjs': "const k = await page.getByTestId('x').textContent() // text-read: key — finds the row\nchk(rows.includes(k), 'the row is there')" }],
  // Each where a real read would be caught: in a condition, or a statement of its own.
  ['passes', 'textContent in a comment, a string and a regex, and a write', {
    'c.mjs': [
      '// el.textContent() in a comment is not a read',
      "chk(label !== 'el.textContent()' && /.textContent[(]/.test(src), 'nothing here reads a page')",
      "await page.evaluate(() => { document.body.textContent = '' })",
    ].join('\n'),
  }],
]

function runCases(gate) {
  let fail = 0
  const seen = {}
  console.log(`\n▶ planted suites, each run through ${gate === SELF ? 'this gate' : 'the gate under test'}`)
  for (const [want, name, files, pattern] of CASES) {
    const dir = mkdtempSync(join(tmpdir(), 'text-reads-'))
    let r
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), `${text}\n`)
      }
      const env = { ...process.env, SUITE_DIR: dir }
      delete env.TEXT_READS_UNDER_TEST
      r = spawnSync(process.execPath, [gate], { encoding: 'utf8', env, timeout: 60_000 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const ok = want === 'caught' ? r.status === 1 && pattern.test(out) : r.status === 0 && /\[text-reads\] ok/.test(out)
    seen[name] = { ok, first: out.split('\n').find((l) => l.startsWith('✗') || l.startsWith('[text-reads] ok')) ?? '' }
    if (ok) console.log(`  \x1b[32mPASS\x1b[0m ${want === 'caught' ? 'caught' : 'passes'}: ${name}`)
    else {
      fail += 1
      console.log(`  \x1b[31mFAIL\x1b[0m ${want === 'caught' ? 'not caught' : 'did not pass'}: ${name} — exit ${r.status}: ${out.trim().split('\n')[0]}`)
    }
  }
  console.log(`\n${CASES.length - fail} passed, ${fail} failed`)
  return { fail, seen }
}

if (process.env.TEXT_READS_UNDER_TEST) {
  // One pass of the cases against a broken copy, started by `proveMutationsBite` below.
  process.exitCode = runCases(process.env.TEXT_READS_UNDER_TEST).fail ? 1 : 0
} else {
  const realOk = report(scan(SUITES))
  if (process.argv.includes('--mutate')) {
    const { fail, seen } = runCases(SELF)
    const planted = seen[CASES[0][1]]
    const fixed = seen[CASES[1][1]]
    console.log(
      `[text-reads] mutate: the planted hr-9 read was ${planted.ok ? 'caught' : 'NOT caught'} — ${planted.first}\n` +
        `[text-reads] mutate: the same suite, filtered to visible and read with innerText, ${fixed.ok ? 'passes' : 'does NOT pass'} — ${fixed.first}`,
    )
    const alive = (mutant) => {
      const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8', timeout: 60_000 })
      return { ok: /\[text-reads\]|✗/.test(r.stdout ?? ''), why: r.stderr }
    }
    /*
     * EACH ANCHOR IS WRITTEN IN TWO PIECES, because this file holds its own
     * mutations: written whole, every anchor would be found twice — where it
     * works, and here — and `proveMutationsBite` refuses an anchor that is
     * not exactly one place.
     */
    const at = (...pieces) => pieces.join('')
    const blind = proveMutationsBite({
      subject: SELF,
      caseFile: SELF,
      envVar: 'TEXT_READS_UNDER_TEST',
      label: 'this gate',
      alive,
      mutations: [
        ['messages-decide', at('if (k !== null && k >= 1) ', "read.kind = 'message'"), "if (k !== null && k >= 99) read.kind = 'message'"],
        ['any-guard-will-do', at('const GUARD = /', '\\.filter'), 'const GUARD = /|\\.filter'],
        ['helpers-unread', at("if (!read.kind) {\n      let text = ''", ''), "if (!read.kind) {\n      read.kind = k === 0 ? undefined : 'guarded'\n      let text = ''"],
        ['every-variable-a-message', at('return uses.every((u) => ', '(inCheck(u) ?? 0) >= 1)'), 'return true'],
        ['no-floor', at('const MIN_SUITES = ', 'process.env.SUITE_DIR ? 1 : 100'), 'const MIN_SUITES = 0'],
        ['strings-are-code', at("      } else blank(code, i)\n    } else if (mode === ", "'template') {"), "      }\n    } else if (mode === 'template') {"],
        ['regexes-are-code', at('      } else blank(code, i)\n    }\n  }\n', '  return { code'), '      }\n    }\n  }\n  return { code'],
        ['comments-are-code', at("      if (c === '\\n') mode = 'code'\n", '      else blank(code, i), blank(bare, i)'), "      if (c === '\\n') mode = 'code'\n      else blank(bare, i)"],
        ['writes-are-reads', at("if (after === '=') ", 'continue'), 'if (false) continue'],
        ['any-reason-will-do', at('} else if (!REASONS.includes(mk.reason)) {\n', '        problems.push'), '} else if (false) {\n        problems.push'],
        ['stale-markers-pass', at('} else if (!mk.used) {', '\n'), '} else if (false) {\n'],
        ['markers-anywhere', at('      if (mk.inCheck) {', '\n        problems.push('), '      if (false) {\n        problems.push('],
        ['roots-not-followed', at('if (d && !(d.from <= start && start < d.to)) ', 'text +='), 'if (false) text +='],
        ['violations-exit-zero', at('    process.exitCode = 1\n', '    return false'), '    process.exitCode = 0\n    return false'],
      ],
    })
    if (!realOk || fail || blind) process.exitCode = 1
  }
}
