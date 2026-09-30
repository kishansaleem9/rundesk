#!/usr/bin/env node
/*
 * A STATUS THAT CAN BE 0 IS NEVER READ AS SUCCESS BY AN UPPER BOUND ALONE
 * (`found-30-sep/status-zero-passes-status-only-checks`), NOR AS NO FAILURE BY
 * A LOWER BOUND ALONE IN A GUARD (`found-30-sep/status-zero-slips-setup-guards`).
 *
 * `lib/fixture.mjs`'s one client answers `{ status: 0, ok: false, … }` when
 * nothing answers — the API is down, restarted under the run, the connection
 * dropped — unless the suite binds it with `noAnswer: 'throw'`
 * (`suite-hygiene/apiAs-duplicated-62`). And `0 < 300`. So in a suite bound the
 * default way,
 *
 *     chk(healed.status < 300, 'and the platform’s Forms switch is back on …')
 *
 * says the switch was put back when nothing answered the PUT, and
 *
 *     if (gate.status < 400) throw new Error('the member could open the hidden blocker …')
 *
 * says "the member could open the hidden blocker" about a dead API. A hand-made
 * answer does the same in any suite: `x ? await A(…) : { status: 0 }` stands in
 * for a step that was never taken, and `ai-value` turned a put-back that threw
 * into `{ status: 0 }` and then passed "the workspace's own benchmark is put
 * back" on it.
 *
 * MEASURED FIRST, 30 September, at 8c1b727: 389 status comparisons with an
 * upper bound in the suites' code. In the 112 suites bound the default way, 168
 * had no lower bound, in 61 suites: 162 in a check's condition, 4 in a guard
 * that throws, 1 in a helper a check calls, 1 in an `if`. And 26 more, in 12
 * suites bound to throw, read a name that can hold a hand-made `status: 0` or a
 * helper's: 194 in 73 suites, each rewritten (none exempt).
 *
 * THE RULE. A STATUS — `x.status`, a bare `status`, or a name ending in
 * `Status` (not one bound to a page response's `.status()`, which is never 0) —
 * compared with an UPPER BOUND ALONE (`< N`, `<= N`, `N > …`, `N >= …`) is
 * refused where it CAN BE 0:
 *
 *   ZERO-CLIENT   the suite binds the fixture's client without
 *                 `noAnswer: 'throw'` (`apiAsAt(API)`, `apiAsAt(API, {
 *                 emptyBodyOn … })`), so any answer in it can be 0;
 *   PLACEHOLDER   in any suite, the name it is read from is bound to a value
 *                 holding a hand-made `status: 0` (`: { status: 0 }`,
 *                 `.catch(() => ({ status: 0 }))`, an assignment in a catch);
 *   ZERO-HELPER   or to a call of a function in the suite whose body hands one
 *                 back (`file-exports`' `download`).
 *
 * WHERE: EVERY COMPARISON IN CODE, not only a check's condition. The ledger's
 * own examples are guards; `ai-task-reads` decides a check through a helper;
 * and following a value from a helper, a variable or a `waitUntil` into a
 * check is a parser's job (`check-suite-text-reads` says why). A check's
 * MESSAGE decides nothing and is not read.
 *
 * A LOWER BOUND is another conjunct of the same `&&` chain, grouping
 * parentheses stepped through: the same status `>= N`, `> N`, `!== 0`, tested
 * for truth (`x.status && …`), or the same answer's `ok`. A floor across an
 * `||`, a ternary or another statement does not count.
 *
 * THE FIX, per condition: `x.ok` (2xx), which is what `status < 300` meant, where
 * it means "it worked" — the client's answer and a fetch `Response` both have it,
 * and a hand-made `{ status: 0 }` does not; `must(res, what)` where what follows
 * cannot do without it; a floor (`>= 200 &&`) on a bare number; or the binding
 * `noAnswer: 'throw'`. A refusal is `>= 400` or its status, which a 0 fails.
 *
 * RULE 2, THE MIRROR: A GUARD. A setup guard that stops the run on
 * `x.status >= 300` (`>= 400`, `> 299`, `300 <= x.status`) lets a status of 0
 * through — 0 is below the bound — so with nothing answering the setup goes on
 * and the run reports the product. Nine grant guards stood on
 * `granted = role.data?.id ? await A(…) : { status: 0 }`: when the role was not
 * made the grant was never tried, and the delegate's checks failed as the
 * product's rather than "could not grant". MEASURED FIRST, 30 September, at
 * f532edc: 616 such guards in the suites' code; 424 of them, in 116 suites,
 * read a status that can be 0 by the same three reasons (404 ZERO-CLIENT, 20
 * PLACEHOLDER — the nine and a tenth among them), 5 already caught the 0
 * beside the bound (`|| x.status === 0`), and 187 read a client that rejects.
 * Each of the 424 now reads `!x.ok`, its message kept: a 0 and a hand-made
 * `{ status: 0 }` both make it true. A guard is an `if` whose branch stops on
 * the failure (throws, exits or bails with a code but 0, returns with nothing,
 * `false` or the answer) or notes it; a refusal CHECK written `>= 400` is none,
 * and is sound, and so is a branch that ends the run as a pass (a skip,
 * `process.exit(0)`) or says yes on a refusal (`if (r.status >= 400) return
 * true` in a refusal helper): a 0 goes past either and fails. One note of a
 * grant never tried, `data-transfer-keys:217`, said nothing on its
 * `{ status: 0 }`; it is recorded for its check now. What counts as a guard,
 * and as the 0 caught beside one, is written where rule 2 is read, below.
 *
 * EXEMPT, by `// status-floor: <reason>` at the end of the comparison's own
 * line, the reason one of `not-a-client` (the status is a page response's or
 * another that cannot be 0, which the gate cannot tell) or `zero-fails` (a 0
 * makes the condition false where it stands: under a `!`, or counted among
 * answers that must all be refusals). Never inside a check's arguments — the
 * other gates split those on text and a comment moves the split — so a
 * comparison that needs one is hoisted into a variable first. An unknown
 * reason, or a marker that exempts nothing on its line, is a failure. A guard
 * takes only `not-a-client`: a 0 that fails a guard's condition is the guard's
 * defect, so `zero-fails` never exempts one.
 *
 * READ AS JAVASCRIPT, NOT AS LINES: comments, strings, regex literals and
 * template text are blanked before anything is matched (`lex`, copied from
 * `check-suite-api-clients`, which runs when imported). The binding's options
 * are read from the source, since `'throw'` is a string. A suite that does not
 * lex to a clean end is reported, not guessed at.
 *
 * A GATE THAT READ NOTHING ANSWERS ok AS SURELY AS ONE THAT READ EVERYTHING:
 * fewer than 100 suites read is a failure (1 under `SUITE_DIR`).
 *
 * `--mutate` plants suites in a temp directory — the dependency-read-access
 * guard, `flag-resolution`'s restore, a grant guard on `{ status: 0 }` and a
 * grant only noted among them — requires every shape above to be caught and
 * `ok`, `!ok`, a floor, a 0 caught beside a guard's bound, a refusal helper, a
 * skip, a `noAnswer: 'throw'` binding and a page response to pass, then breaks
 * this file one rule at a time and requires a
 * planted case to notice (`lib/mutate.mjs`). The cases are `CASES` in this
 * file, which is also the case file the mutants are run against.
 *
 *   node scripts/check-suite-status-floor.mjs [--mutate]
 *   SUITE_DIR=<dir> node scripts/check-suite-status-floor.mjs
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
const REASONS = ['not-a-client', 'zero-fails']
/** The reasons that exempt each shape of site: a 0 that fails a guard's condition is the guard's defect, never its excuse. */
const FITS = { upper: REASONS, guard: ['not-a-client'] }
const MARKER = /\/\/\s*status-floor:\s*([\w-]*)/g
const CHECKS = /(?<![.\w$])(?:chk|check)\s*\(|\.\s*step\s*\(/g
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'await', 'yield'])
/** What a statement can start with that is not part of the condition after it. */
const LEADERS = /^(?:(?:return|throw|yield|case|else|do|await|void)\b\s*)+/
/** A hand-made answer's status of 0: `status: 0`, as code (a string saying so is blanked). */
const ZERO = /(?<![\w$.])status\s*:\s*0(?![\w.])/

/*
 * `src` with comments, string and regex contents and template text blanked,
 * exactly as long, so an index means the same place in both. `clean` says
 * whether the walk ended outside every string and comment; `regexEnds` holds
 * where each regex literal closes; `comments` where each `//` comment starts,
 * so a marker in a string is told from one in a comment.
 */
export function lex(src) {
  const code = src.split('')
  // Newlines survive in comments and strings, so a line is still a line; in
  // template text they go too, so a wrapped sentence does not end a statement.
  const blank = (i, keepNewline = true) => {
    if (i < code.length && !(keepNewline && code[i] === '\n')) code[i] = ' '
  }
  const regexEnds = new Set()
  const comments = new Set()
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
        if (n === '/') comments.add(i)
        blank(i), blank(i + 1)
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
      else blank(i)
    } else if (mode === 'block') {
      blank(i)
      if (c === '*' && n === '/') {
        blank(i + 1)
        i += 1
        mode = 'code'
      }
    } else if (mode === 'string') {
      if (c === '\\') {
        blank(i), blank(i + 1)
        i += 1
      } else if (c === quote || c === '\n') {
        mode = 'code'
        if (c === quote) prev = c
        word = ''
      } else blank(i)
    } else if (mode === 'template') {
      if (c === '\\') {
        blank(i, false), blank(i + 1, false)
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
      } else blank(i, false)
    } else if (mode === 'regex') {
      if (c === '\\') {
        blank(i), blank(i + 1)
        i += 1
      } else if (c === '\n') mode = 'code'
      else if (inClass) {
        if (c === ']') inClass = false
        blank(i)
      } else if (c === '[') {
        inClass = true
        blank(i)
      } else if (c === '/') {
        mode = 'code'
        regexEnds.add(i)
        prev = ')' // a regex literal is a value: a `/` after it divides
        word = ''
      } else blank(i)
    }
  }
  return { code: code.join(''), clean: mode === 'code' && frames.length === 0, regexEnds, comments }
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
const isWord = (c) => c !== undefined && /[\w$]/.test(c)
const skipFwd = (code, i) => {
  for (; i < code.length && /\s/.test(code[i]); i++);
  return i
}
const skipBack = (code, i) => {
  for (; i >= 0 && /\s/.test(code[i]); i--);
  return i
}
const wordBefore = (code, end) => {
  let k = end
  while (k >= 0 && isWord(code[k])) k--
  return { word: code.slice(k + 1, end + 1), at: k + 1 }
}
const trimmed = (code, a, b) => {
  while (a < b && /\s/.test(code[a])) a++
  while (b > a && /\s/.test(code[b - 1])) b--
  return [a, b]
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
/** Spaces out, `?.` read as `.`: the same operand however it is written. */
const norm = (s) => s.replace(/\s+/g, '').replace(/\?\./g, '.')

/*
 * Where an expression that starts at `from` ends: a `,` or `;` outside every
 * bracket it opened, a closing bracket it did not open, or a newline nothing
 * carries on over (copied from `check-suite-api-clients`).
 */
const exprEnd = (code, from, regexEnds) => {
  let d = 0
  let last = ''
  for (let k = from; k < code.length; k++) {
    const c = code[k]
    if (c === '\n' && d === 0 && last) {
      const next = code[skipFwd(code, k + 1)] ?? ''
      if (!/[=(\[{,?:&|+\-*/.<>!]/.test(last) && !/[.?:&|+*,=]/.test(next)) return k
      continue
    }
    if (/\s/.test(c)) continue
    if ('([{'.includes(c)) d += 1
    else if (')]}'.includes(c)) {
      if (d === 0) return k
      d -= 1
    } else if ((c === ';' || c === ',') && d === 0) return k
    last = regexEnds.has(k) ? 'x' : c
  }
  return code.length
}

/** Every function in `code`: its name when it has one, where its body starts and ends (from `check-suite-api-clients`). */
function functionsIn(code, regexEnds) {
  const fns = []
  for (const m of code.matchAll(/(?<![\w$.])(?:async\s+)?function\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const close = matchForward(code, m.index + m[0].length - 1)
    const b = close < 0 ? -1 : skipFwd(code, close + 1)
    const end = code[b] === '{' ? matchForward(code, b) : -1
    if (end > 0) fns.push({ start: m.index, name: m[1] ?? null, bodyStart: b, end: end + 1 })
  }
  for (const m of code.matchAll(/=>/g)) {
    const j = skipBack(code, m.index - 1)
    let start
    if (code[j] === ')') start = matchBack(code, j)
    else if (isWord(code[j])) start = wordBefore(code, j).at
    else continue
    if (start < 0) continue
    const before = wordBefore(code, skipBack(code, start - 1))
    const b = skipFwd(code, m.index + 2)
    const end = code[b] === '{' ? matchForward(code, b) + 1 : trimmed(code, b, exprEnd(code, b, regexEnds))[1]
    if (end > b) fns.push({ start: before.word === 'async' ? before.at : start, name: null, bodyStart: b, end })
  }
  return fns
}

/** Whether the `(` at `i` groups (`(a && b)`, `!(x)`, `return (x)`) rather than calls or heads a statement (`f(`, `if (`). */
const isGroup = (code, i) => {
  const p = skipBack(code, i - 1)
  if (p < 0) return true
  if (!/[\w$)\]`]/.test(code[p])) return true
  return KEYWORDS.has(wordBefore(code, p).word)
}

/*
 * THE SEGMENT AROUND `at` between `lo` and `hi` (a bracket's inside, or the
 * file): the stretch at that bracket's own level bounded by `,` `;` `||` `??`,
 * a ternary's `?` or `:`, `=>`, an assignment, or a line nothing carries on over.
 */
function segmentAround(code, lo, hi, at) {
  let a = lo
  let b = hi
  let last = ''
  for (let k = lo; k < hi; k++) {
    const c = code[k]
    // A bracket is one term, whatever is inside it.
    if ('([{'.includes(c)) {
      const e = matchForward(code, k)
      if (e < 0 || e >= hi) break
      k = e
      last = ')'
      continue
    }
    let cut = 0
    if (c === '\n') {
      if (last && !/[=(\[{,?:&|+\-*/.<>!]/.test(last) && !/[.?:&|+*,=]/.test(code[skipFwd(code, k + 1)] ?? '')) cut = 1
    } else if (c === ',' || c === ';' || c === ':') cut = 1
    else if ((c === '|' && code[k + 1] === '|') || (c === '?' && code[k + 1] === '?')) cut = 2
    else if (c === '?' && code[k + 1] !== '.') cut = 1
    else if (c === '=' && code[k + 1] === '>') cut = 2
    else if (c === '=' && code[k + 1] !== '=' && !'=!<>'.includes(code[k - 1])) cut = 1
    if (cut) {
      if (k + cut <= at) a = k + cut
      else if (k >= at) {
        b = k
        break
      }
      k += cut - 1
      last = ''
      continue
    }
    if (!/\s/.test(c)) last = c
  }
  return trimmed(code, a, b)
}

/** The innermost bracket open before `at` and still open there, or -1 at the top level. */
const enclosingOpen = (code, at) => {
  for (let k = at - 1; k >= 0; k--) {
    if (')]}'.includes(code[k])) {
      const o = matchBack(code, k)
      if (o < 0) return -1
      k = o
    } else if ('([{'.includes(code[k])) return k
  }
  return -1
}

/*
 * THE CONJUNCTION AROUND `at`, as its conjuncts: the segment holding it, widened
 * through any grouping parenthesis that is the whole of its segment, then split
 * on `&&` — and a conjunct that is itself a group of `&&`s split in its turn.
 */
function conjunctsAround(code, at) {
  let open = enclosingOpen(code, at)
  let [a, b] = segmentAround(code, open + 1, open < 0 ? code.length : matchForward(code, open), at)
  for (;;) {
    if (open < 0 || code[open] !== '(' || !isGroup(code, open)) break
    const close = matchForward(code, open)
    const [ia, ib] = trimmed(code, open + 1, close)
    if (ia !== a || ib !== b) break
    const outer = enclosingOpen(code, open)
    ;[a, b] = segmentAround(code, outer + 1, outer < 0 ? code.length : matchForward(code, outer), open)
    open = outer
  }
  const leaves = []
  const split = (x, y) => {
    let d = 0
    let s = x
    const parts = []
    for (let k = x; k < y; k++) {
      if ('([{'.includes(code[k])) d += 1
      else if (')]}'.includes(code[k])) d -= 1
      else if (d === 0 && code[k] === '&' && code[k + 1] === '&') {
        parts.push([s, k])
        s = k + 2
        k += 1
      }
    }
    parts.push([s, y])
    for (const [p, q] of parts) {
      const [ta, tb] = trimmed(code, p, q)
      const lead = LEADERS.exec(code.slice(ta, tb))
      const from = lead ? ta + lead[0].length : ta
      // A conjunct that is one group of `&&`s is split in its turn.
      if (code[from] === '(' && matchForward(code, from) === tb - 1 && isGroup(code, from)) {
        const [ga, gb] = trimmed(code, from + 1, tb - 1)
        const [sa, sb] = segmentAround(code, ga, gb, ga)
        if (sa === ga && sb === gb) {
          split(ga, gb)
          continue
        }
      }
      leaves.push([from, tb])
    }
  }
  split(a, b)
  return leaves
}

/** Every status in one suite compared with an upper bound alone where it can be 0, and every marker. */
export function floorlessIn(src) {
  const { code, clean, regexEnds, comments } = lex(src)
  const newlines = []
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') newlines.push(i)
  const lineOf = (i) => {
    let lo = 0
    let hi = newlines.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (newlines[mid] < i) lo = mid + 1
      else hi = mid
    }
    return lo + 1
  }

  /*
   * ZERO-CLIENT: the fixture's `apiAs`, under the name the suite imports it by,
   * called without `noAnswer: 'throw'`. The options are read from the source:
   * `'throw'` is a string, and the lexed code has it blanked.
   */
  const local = new Set()
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/lib\/fixture\.mjs['"]/g)) {
    if (code[m.index] !== 'i') continue // an import in a comment or a string is not one
    for (const spec of m[1].split(',')) {
      const s = /^\s*apiAs(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(spec)
      if (s) local.add(s[1] ?? 'apiAs')
    }
  }
  let zeroClient = false
  for (const name of local) {
    for (const m of code.matchAll(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*\\(`, 'g'))) {
      const open = m.index + m[0].length - 1
      const close = matchForward(code, open)
      if (close < 0) continue
      const options = argSpans(code, open, close)[1]
      if (!options || !/noAnswer\s*:\s*['"]throw['"]/.test(src.slice(...options))) zeroClient = true
    }
  }

  /* WHAT EACH NAME IS BOUND TO: every declarator, every later `name = …`, every object key `name: …`. */
  const bindings = new Map()
  const bind = (name, from) => {
    const [a, b] = trimmed(code, from, exprEnd(code, from, regexEnds))
    if (!bindings.has(name)) bindings.set(name, [])
    bindings.get(name).push({ a, b })
  }
  for (const m of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) bind(m[1], m.index + m[0].length)
  for (const m of code.matchAll(/(?<![\w$])([A-Za-z_$][\w$]*)\s*:(?!:)/g)) {
    const before = skipBack(code, m.index - 1)
    if (code[before] === '{' || code[before] === ',') bind(m[1], m.index + m[0].length)
  }
  const fns = functionsIn(code, regexEnds)
  /** ZERO-HELPER: functions whose body hands back a hand-made status of 0, by name. */
  const zeroFns = new Set()
  for (const f of fns) {
    if (!ZERO.test(code.slice(f.bodyStart, f.end))) continue
    if (f.name) zeroFns.add(f.name)
    for (const [name, vals] of bindings) if (vals.some((v) => v.a === f.start)) zeroFns.add(name)
  }
  /** Why the name at the root of an operand can hold a 0, or null. */
  const zeroRoot = (root) => {
    for (const v of bindings.get(root) ?? []) {
      const text = code.slice(v.a, v.b)
      if (ZERO.test(text)) return 'PLACEHOLDER'
      const call = /^(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(text)
      if (call && zeroFns.has(call[1])) return 'ZERO-HELPER'
    }
    return null
  }
  /*
   * A STATUS COPIED INTO A FIELD OF ANOTHER NAME (`found-30-sep/status-floor-blind-to-other-names`).
   * `time-tracking-readers`' `track()` returned `{ stop: stop.status, … }`, and its
   * check compared `g.stop < 300`: a status, under a name this knew nothing of,
   * where `stop` was a hand-made `{ status: 0 }` when nothing was started. So a
   * property written from an answer's `.status` (not a page response's
   * `.status()`) is a status wherever this file reads it.
   */
  const statusFields = new Set(
    [...code.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$.?]*\.status\b(?!\s*\()/g)].map((m) => m[1]),
  )
  /** A name ending in `Status` bound only to a page response's `.status()`, which is never 0. */
  const pageStatus = (name) => {
    const vals = bindings.get(name) ?? []
    return vals.length > 0 && vals.every((v) => /\.\s*status\s*\(/.test(code.slice(v.a, v.b)))
  }
  /** Whether an operand, spaces out, is a status: `….status`, a bare `status`, a name ending in `Status` (not a page response's), or a field a status was copied into. */
  const statusNamed = (operand) => {
    const last = /([A-Za-z_$][\w$]*)$/.exec(operand)?.[1]
    if (!last || !(last === 'status' || /Status$/.test(last) || (operand.includes('.') && statusFields.has(last)))) return false
    return !(last !== 'status' && !statusFields.has(last) && pageStatus(last))
  }
  /** Why the status an operand reads can be 0 — its root's binding first, then the suite's client — or null. */
  const canBeZero = (operand) => {
    const root = /^([A-Za-z_$][\w$]*)/.exec(operand)?.[1] ?? null
    return (root && zeroRoot(root)) ?? (zeroClient ? 'ZERO-CLIENT' : null)
  }

  const checks = []
  for (const m of code.matchAll(CHECKS)) {
    const open = m.index + m[0].length - 1
    const close = matchForward(code, open)
    if (close > 0) checks.push({ open, close, args: argSpans(code, open, close) })
  }
  /** Which argument of the innermost check around `p` holds it, or null outside every check. */
  const inCheck = (p) => {
    const call = checks.filter((c) => c.open < p && p < c.close).sort((x, y) => y.open - x.open)[0]
    return call ? call.args.findIndex(([a, b]) => p >= a && p <= b) : null
  }

  /*
   * THE COMPARISONS: `<`, `<=` with a number after them, and `>`, `>=` with a
   * number before them — each with a status on its other side.
   */
  /** The operand chain that ends at `end`: `res.status`, `(await A(x)).status`, `l.lister?.status`. */
  const chainBack = (end) => {
    let k = end
    for (;;) {
      if (code[k] === ')' || code[k] === ']') {
        const o = matchBack(code, k)
        if (o < 0) return -1
        k = skipBack(code, o - 1)
        if (code[k] === '.' && code[k - 1] === '?') k = skipBack(code, k - 2)
        // `(await A(x)).status`: the group starts the chain, and so it does after `return (…)`.
        if (!isWord(code[k]) && code[k] !== ')' && code[k] !== ']') return o
        if (isWord(code[k]) && KEYWORDS.has(wordBefore(code, k).word)) return o
        continue
      }
      if (!isWord(code[k])) return k + 1
      const w = wordBefore(code, k)
      const q = skipBack(code, w.at - 1)
      if (code[q] === '.' && code[q - 1] !== '.') {
        k = skipBack(code, code[q - 1] === '?' ? q - 2 : q - 1)
        continue
      }
      return w.at
    }
  }
  const chainFwd = (start) => {
    let k = skipFwd(code, start)
    if (code[k] === '(') k = matchForward(code, k) + 1
    else if (isWord(code[k])) while (isWord(code[k])) k++
    else return -1
    for (;;) {
      let j = skipFwd(code, k)
      if (code[j] === '?' && code[j + 1] === '.') j = skipFwd(code, j + 2)
      else if (code[j] === '.') j = skipFwd(code, j + 1)
      else if (code[j] === '(' || code[j] === '[') {
        k = matchForward(code, j) + 1
        continue
      } else return k
      if (code[j] === '(' || code[j] === '[') {
        k = matchForward(code, j) + 1
        continue
      }
      if (!isWord(code[j])) return k
      while (isWord(code[j])) j++
      k = j
    }
  }
  const sites = []
  const considered = { compared: 0, floored: 0, cannotBeZero: 0, guards: 0, notes: 0, caught: 0, guardCannotBeZero: 0, notGuards: 0 }
  for (const m of code.matchAll(/(?<![<>=!])(<=?|>=?)(?![<>=])/g)) {
    const op = m[1]
    const at = m.index
    let opStart
    let opEnd
    if (op[0] === '<') {
      // `x.status < 300`: a number after, the status before
      if (!/^\s*\d/.test(code.slice(at + op.length, at + op.length + 12))) continue
      opEnd = skipBack(code, at - 1) + 1
      opStart = chainBack(opEnd - 1)
    } else {
      // `300 > x.status`: a number before, the status after (`=>` is excluded above)
      const n = skipBack(code, at - 1)
      if (!/^\d[\d_.]*$/.test(wordBefore(code, n).word)) continue
      opStart = skipFwd(code, at + op.length)
      opEnd = chainFwd(opStart)
    }
    if (opStart < 0 || opEnd <= opStart) continue
    // The operand as written (strings included, so `A('/x')` is not `A('/y')`), spaces out.
    const operand = norm(src.slice(opStart, opEnd))
    if (!statusNamed(operand)) continue
    const where = inCheck(at)
    if (where !== null && where >= 1) continue // a check's message decides nothing
    considered.compared += 1

    const base = operand.endsWith('.status') ? operand.slice(0, -'.status'.length) : null
    const same = (x) => x === operand
    /*
     * A FLOOR is a whole conjunct that no status of 0 satisfies: the same status
     * tested for truth, `> N` with N ≥ 0, `>= N` with N > 0 (either way round),
     * `!== 0`, or the same answer's `ok`.
     */
    const floorLeaf = (t) => {
      let f
      if ((f = /^(?:!!)?(.+)$/.exec(t)) && same(f[1])) return true
      if ((f = /^(.+?)(>=|>)(-?[\d_.]+)$/.exec(t)) && same(f[1])) return f[2] === '>' ? Number(f[3]) >= 0 : Number(f[3]) > 0
      if ((f = /^(-?[\d_.]+)(<=|<)(.+)$/.exec(t)) && same(f[3])) return f[2] === '<' ? Number(f[1]) >= 0 : Number(f[1]) > 0
      if ((f = /^(.+?)!==?(-?[\d_.]+)$/.exec(t)) && same(f[1])) return Number(f[2]) === 0
      if (base && (f = /^(.+)\.ok(?:===true)?$/.exec(t)) && f[1] === base) return true
      return false
    }
    const floored = conjunctsAround(code, at).some(([a, b]) => floorLeaf(norm(src.slice(a, b))))
    if (floored) {
      considered.floored += 1
      continue
    }
    const why = canBeZero(operand)
    if (!why) {
      considered.cannotBeZero += 1
      continue
    }
    const said = src.slice(opStart, opEnd).replace(/\s+/g, ' ')
    const num = op[0] === '<' ? /\d[\d_.]*/.exec(code.slice(at + op.length))[0] : wordBefore(code, skipBack(code, at - 1)).word
    sites.push({
      line: lineOf(at),
      rule: why,
      shape: 'upper',
      text: op[0] === '<' ? `${said} ${op} ${num}` : `${num} ${op} ${said}`,
      inCheck: where === 0,
    })
  }

  /*
   * RULE 2 — A FAILURE READ AS A LOWER BOUND ALONE, IN A GUARD
   * (`found-30-sep/status-zero-slips-setup-guards`). The mirror of the loop
   * above. A setup guard stops the run when a step failed, and one that reads
   * the failure as `x.status >= 300` (`>= 400`, `> 299`, `300 <= x.status`: a
   * lower bound of 300 or more) lets a status of 0 through, since 0 is below
   * it: with nothing answering, the setup goes on and the run reports the
   * product. Nine grant guards read
   *
   *     const granted = role.data?.id ? await A(…) : { status: 0 }
   *     if (granted.status >= 300) throw new Error(`could not grant the delegate: …`)
   *
   * so when the role was not made the grant was never tried, and the delegate's
   * checks failed as the product's rather than "could not grant".
   *
   * A GUARD is an `if` whose branch stops on the failure, or notes it
   * (`branchKind`, below): a branch that ends the run as a pass or says yes on
   * a refusal is none. The comparison is a term of its condition — reached
   * through `||`, `&&`, grouping parentheses and the callback of a `.some(…)`,
   * and not under a `!` or deciding a ternary. A refusal CHECK written `>= 400`
   * is not a guard, and is sound: a 0 fails it.
   *
   * A CATCHER is another disjunct of an `||` chain on the way up that a status
   * of 0 makes true: the same answer's `!ok`, or the same status false, `=== 0`
   * or `!== N` (N ≠ 0), either way round. A read-back (`|| !x.data?.id`) is not
   * one, as the loop above counts none for a floor: it stands for the status
   * only by coincidence. Nor is an upper bound (`x.status < 200 ||`), which the
   * loop above refuses where it stands: `!x.ok` says it once, for both.
   */
  /** Whether `k` starts an `||` or an `&&`. */
  const joins = (k) => (code[k] === '|' && code[k + 1] === '|') || (code[k] === '&' && code[k + 1] === '&')
  /** The disjuncts of the `||` chain filling [x, y): a group that is the whole of one is opened in its turn. */
  const disjuncts = (x, y) => {
    const parts = []
    let d = 0
    let s = x
    for (let k = x; k < y; k++) {
      if ('([{'.includes(code[k])) d += 1
      else if (')]}'.includes(code[k])) d -= 1
      else if (d === 0 && code[k] === '|' && code[k + 1] === '|') {
        parts.push([s, k])
        s = k + 2
        k += 1
      }
    }
    parts.push([s, y])
    const out = []
    for (const [p, q] of parts) {
      const [ta, tb] = trimmed(code, p, q)
      if (code[ta] === '(' && matchForward(code, ta) === tb - 1 && isGroup(code, ta)) out.push(...disjuncts(ta + 1, tb - 1))
      else out.push([ta, tb])
    }
    return out
  }
  /*
   * THE `if (` WHOSE CONDITION HOLDS THE TERM [a, b), walking out one bracket at
   * a time, with the range of each `||` chain passed on the way; or null when
   * the term is not a term of an `if`'s condition.
   */
  const guardAround = (a, b) => {
    const levels = []
    for (;;) {
      const open = enclosingOpen(code, a)
      if (open < 0 || code[open] !== '(') return null
      const close = matchForward(code, open)
      // In `xs.some((r) => r.status >= 300 || …)` the chain is the body of the arrow the call is handed.
      let arrow = -1
      for (let k = open + 1, d = 0; k < a; k++) {
        if ('([{'.includes(code[k])) d += 1
        else if (')]}'.includes(code[k])) d -= 1
        else if (d === 0 && code[k] === '=' && code[k + 1] === '>') arrow = k
      }
      const from = arrow < 0 ? open + 1 : skipFwd(code, arrow + 2)
      // The term is one of the `||`/`&&` terms filling [from, close): not under a `!`, not a ternary's.
      const before = skipBack(code, a - 1)
      const after = skipFwd(code, b)
      if (!(before < from || joins(before - 1))) return null
      if (!(after >= close || joins(after))) return null
      levels.push([from, close])
      const kw = skipBack(code, open - 1)
      if (arrow >= 0) {
        const fn = wordBefore(code, kw)
        if (fn.word !== 'some' || code[skipBack(code, fn.at - 1)] !== '.') return null
        a = chainBack(close)
        b = close + 1
        continue
      }
      if (isWord(code[kw]) && wordBefore(code, kw).word === 'if') return { close, levels }
      // Otherwise a group, stepped through: a call's parenthesis fails the check above one level out.
      a = open
      b = close + 1
    }
  }
  /*
   * WHAT THE BRANCH IS FOR. A 0 skips the branch and goes on past it, so
   * whether that is a defect is decided by what the branch does:
   *
   *   'fail'     it stops on the failure: throws; exits or bails with any code
   *              but a literal 0 (`bail()` is 1, and `process.exit()` or a
   *              computed code is whatever the run has come to, read as a
   *              failure); or returns with nothing, `null`, `false`, the answer
   *              or anything else a caller goes on from. A guard.
   *   'note'     it says the failure (`console.log(…)` and the like). A 0 that
   *              skips it is not said: `data-transfer-keys` noted a grant never
   *              tried on `given.status >= 300`, said nothing on its
   *              `{ status: 0 }`, and went on to fail the importer's check as
   *              the product's. Read as a guard.
   *   'skip'     it ends the run as a pass: `process.exit(0)`, `bail(0)`. A 0
   *              that skips it goes on to the checks, and they fail.
   *   'verdict'  it says yes on a REFUSAL — `return true` or a string, on a
   *              bound of 400 or more, which is what a refusal is: a refusal
   *              helper, a `.map` verdict, a `waitUntil` predicate. A 0 falls
   *              through to the other answer, which a refusal check fails.
   *
   * A skip and a verdict are no guards: `!x.ok` there would turn a dead API
   * into the skip, or into the refusal a check passes on. A yes said on a bound
   * below 400 (`>= 300`) is said of any failure — a failure handed to whoever
   * reads it, a guard in two steps — and is read as 'fail'; so is a refusal
   * said as no (`return false`), since the gate cannot tell it from a failure
   * handed back, and it is said as the yes instead. In a block, a stop on
   * failure anywhere makes the branch one; else a skip or a verdict; else a note.
   */
  const ENDS = /^(?:(?:await\s+)?bail|process\s*\.\s*exit)\s*\(/
  const NOTES = /^console\s*\.\s*(?:log|error|warn|info)\s*\(/
  const RANK = { fail: 3, skip: 2, verdict: 2, note: 1 }
  /** What the statement starting at `k` does, on a failure whose least status is `least`: a RANK, or null for none of them. */
  const statementKind = (k, least) => {
    const text = code.slice(k, k + 40)
    if (/^throw(?![\w$])/.test(text)) return 'fail'
    let m
    if ((m = ENDS.exec(text))) {
      const open = k + m[0].length - 1
      const close = matchForward(code, open)
      return close > 0 && code.slice(open + 1, close).trim() === '0' ? 'skip' : 'fail'
    }
    if (/^return(?![\w$])/.test(text)) {
      let from = k + 'return'.length
      while (code[from] === ' ' || code[from] === '\t') from++
      // `return` alone, before a line break, a `;` or a `}`, hands back nothing.
      if (from >= code.length || ';}\n'.includes(code[from])) return 'fail'
      const value = src.slice(from, exprEnd(code, from, regexEnds)).trim()
      return least >= 400 && /^(?:true|(['"`])[^]+\1)$/.test(value) ? 'verdict' : 'fail'
    }
    if (NOTES.test(text)) return 'note'
    return null
  }
  /** What the branch after the `if (…)` that closes at `close` does: itself, or the strongest statement of its block outside any bracket. */
  const branchKind = (close, least) => {
    const j = skipFwd(code, close + 1)
    if (code[j] !== '{') return statementKind(j, least)
    const end = matchForward(code, j)
    let d = 0
    let kind = null
    for (let k = j + 1; k < end; k++) {
      if ('(['.includes(code[k])) d += 1
      else if (')]'.includes(code[k])) d -= 1
      else if (d === 0 && isWord(code[k]) && !isWord(code[k - 1]) && code[k - 1] !== '.') {
        const here = statementKind(k, least)
        if (here && (!kind || RANK[here] > RANK[kind])) kind = here
      }
    }
    return kind
  }
  /** Whether `l op r` holds, for the numbers a catcher compares (`===`, `==`, `!==`, `!=`). */
  const holds = (l, op, r) => (op[0] === '=' ? l === r : l !== r)
  for (const m of code.matchAll(/(?<![<>=!])(>=?|<=?)(?![<>=])/g)) {
    const cmp = m[1]
    const pos = m.index
    let lo
    let hi
    let term
    let bound
    if (cmp[0] === '>') {
      // `x.status >= 300`: the status on the left, the bound on the right
      const right = /^\s*(\d[\d_.]*)/.exec(code.slice(pos + cmp.length, pos + cmp.length + 12))
      if (!right) continue
      bound = right[1]
      hi = skipBack(code, pos - 1) + 1
      lo = chainBack(hi - 1)
      term = [lo, pos + cmp.length + right[0].length]
    } else {
      // `300 <= x.status`: the bound on the left, the status on the right
      const left = wordBefore(code, skipBack(code, pos - 1))
      if (!/^\d[\d_.]*$/.test(left.word)) continue
      bound = left.word
      lo = skipFwd(code, pos + cmp.length)
      hi = chainFwd(lo)
      term = [left.at, hi]
    }
    if (lo < 0 || hi <= lo) continue
    // The least status the comparison holds for: at 300 or more it reads a failure; below, it is a floor.
    const least = cmp.length === 2 ? Number(bound) : Number(bound) + 1
    if (!(least >= 300)) continue
    const operand = norm(src.slice(lo, hi))
    if (!statusNamed(operand)) continue
    const guard = guardAround(...term)
    const kind = guard && branchKind(guard.close, least)
    if (!kind) continue
    if (kind === 'skip' || kind === 'verdict') {
      considered.notGuards += 1
      continue
    }
    considered[kind === 'note' ? 'notes' : 'guards'] += 1
    const base = operand.endsWith('.status') ? operand.slice(0, -'.status'.length) : null
    const catches = (t) => {
      let f
      if (base && (f = /^!(.+)\.ok$/.exec(t)) && f[1] === base) return true
      if ((f = /^!(.+)$/.exec(t)) && f[1] === operand) return true
      if ((f = /^(.+?)(===?|!==?)(-?[\d_.]+)$/.exec(t)) && f[1] === operand) return holds(0, f[2], Number(f[3]))
      if ((f = /^(-?[\d_.]+)(===?|!==?)(.+)$/.exec(t)) && f[3] === operand) return holds(Number(f[1]), f[2], 0)
      return false
    }
    if (guard.levels.some(([x, y]) => disjuncts(x, y).some(([p, q]) => catches(norm(src.slice(p, q)))))) {
      considered.caught += 1
      continue
    }
    const zero = canBeZero(operand)
    if (!zero) {
      considered.guardCannotBeZero += 1
      continue
    }
    const said = src.slice(lo, hi).replace(/\s+/g, ' ')
    sites.push({
      line: lineOf(pos),
      rule: zero,
      shape: 'guard',
      notes: kind === 'note',
      text: cmp[0] === '>' ? `${said} ${cmp} ${bound}` : `${bound} ${cmp} ${said}`,
      inCheck: false,
    })
  }

  const markers = []
  for (const m of src.matchAll(MARKER)) {
    const slash = m.index
    // A comment's own `//`, not a `//` inside a string or a longer comment's text.
    let commentStart = -1
    for (let k = slash; k >= 0 && src[k] !== '\n'; k--) if (comments.has(k)) commentStart = k
    if (commentStart !== slash) continue
    markers.push({ line: lineOf(slash), reason: m[1], inCheck: inCheck(slash) !== null })
  }
  sites.sort((x, y) => x.line - y.line)
  return { sites, markers, clean, zeroClient, considered }
}

/** The gate over one directory: every site and problem, and a tally of what was read. */
export function scan(dir) {
  const problems = []
  const sites = []
  const tally = { suites: 0, zeroClient: 0, compared: 0, floored: 0, cannotBeZero: 0, guards: 0, notes: 0, caught: 0, guardCannotBeZero: 0, notGuards: 0, exempt: {} }
  let files = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
  } catch {
    files = []
  }
  tally.suites = files.length
  if (files.length < MIN_SUITES) {
    problems.push(
      `only ${files.length} suite(s) read under ${dir}, below the floor of ${MIN_SUITES} — a scan that reads ` +
        'nothing passes, so the zero needs a denominator',
    )
  }
  for (const file of files) {
    const found = floorlessIn(readFileSync(join(dir, file), 'utf8'))
    if (!found.clean) {
      problems.push(`${file}  could not be read as JavaScript — it ends inside a string, comment or template, so any answer about it would be a guess`)
      continue
    }
    if (found.zeroClient) tally.zeroClient += 1
    tally.compared += found.considered.compared
    tally.floored += found.considered.floored
    tally.cannotBeZero += found.considered.cannotBeZero
    tally.guards += found.considered.guards
    tally.notes += found.considered.notes
    tally.caught += found.considered.caught
    tally.guardCannotBeZero += found.considered.guardCannotBeZero
    tally.notGuards += found.considered.notGuards
    const byLine = new Map(found.markers.map((mk) => [mk.line, mk]))
    for (const s of found.sites) {
      const mk = byLine.get(s.line)
      if (mk && FITS[s.shape].includes(mk.reason) && !mk.inCheck) {
        tally.exempt[mk.reason] = (tally.exempt[mk.reason] ?? 0) + 1
        mk.used = true
        continue
      }
      sites.push({ file, ...s })
    }
    for (const mk of found.markers) {
      if (mk.inCheck) {
        problems.push(
          `${file}:${mk.line}  // status-floor: ${mk.reason} — inside a check's arguments, where the other gates split on text ` +
            'and a comment moves the split; hoist the comparison into a variable and mark that line',
        )
      } else if (!REASONS.includes(mk.reason)) {
        problems.push(`${file}:${mk.line}  // status-floor: ${mk.reason} — not a reason this gate knows (${REASONS.join(', ')})`)
      } else if (!mk.used) {
        const guarded = found.sites.some((s) => s.line === mk.line && s.shape === 'guard')
        problems.push(
          `${file}:${mk.line}  // status-floor: ${mk.reason} — exempts nothing: no comparison on this line needs it` +
            (guarded ? ` (a guard takes only ${FITS.guard.join(', ')}: a 0 its condition lets through is the defect itself)` : ''),
        )
      }
    }
  }
  return { problems, sites, tally }
}

const WHY = {
  'ZERO-CLIENT': "the suite binds the fixture's client without noAnswer: 'throw', so it answers 0 when nothing answers",
  PLACEHOLDER: 'the name it is read from can hold a hand-made status of 0',
  'ZERO-HELPER': 'the name it is read from holds what a helper hands back, and that helper can hand back a status of 0',
}

function report({ problems, sites, tally }) {
  for (const p of problems) console.log(`✗ ${p}`)
  for (const s of sites) {
    if (s.shape === 'guard' && s.notes) console.log(`✗ ${s.file}:${s.line}  ${s.rule}  ${s.text} — a note of a failure read as a lower bound alone, which 0 is below, so a 0 is not said; ${WHY[s.rule]}`)
    else if (s.shape === 'guard') console.log(`✗ ${s.file}:${s.line}  ${s.rule}  ${s.text} — a guard reading failure as a lower bound alone, which 0 is below; ${WHY[s.rule]}`)
    else console.log(`✗ ${s.file}:${s.line}  ${s.rule}  ${s.text} — ${WHY[s.rule]}`)
  }
  if (problems.length || sites.length) {
    const upper = sites.filter((s) => s.shape !== 'guard')
    const guards = sites.filter((s) => s.shape === 'guard')
    const of = (list, rule) => list.filter((s) => s.rule === rule).length
    const split = (list) =>
      `in ${new Set(list.map((s) => s.file)).size} suite(s): ${of(list, 'ZERO-CLIENT')} on a client that answers 0, ` +
      `${of(list, 'PLACEHOLDER')} on a hand-made status of 0, ${of(list, 'ZERO-HELPER')} on a helper's`
    console.error(
      `\n[status-floor] ${upper.length} status comparison(s) with an upper bound and no lower bound, where the status can be 0, ` +
        `${split(upper)}; and ${guards.length} guard(s) or note(s) reading a failure as a lower bound alone, where the status can be 0, ` +
        `${split(guards)}${problems.length ? `; and ${problems.length} other problem(s)` : ''}.\n` +
        '0 < 300: nothing answering reads as success. Where the condition means "it worked", read `ok` (2xx), which\n' +
        'the client\'s answer and a fetch Response both have and a hand-made `{ status: 0 }` does not; where what\n' +
        "follows cannot do without it, `must(res, what)`; on a bare number, a floor (`s >= 200 && s < 300`); or bind\n" +
        "the suite's client with `noAnswer: 'throw'`. A refusal is `>= 400` or its status. A comparison a 0 cannot\n" +
        `pass ends its own line with \`// status-floor: <reason>\`, one of ${REASONS.join(', ')} — outside any check's arguments.\n` +
        'And 0 >= 300 is false: a guard that stops the setup on `x.status >= 300` lets nothing-answering through, and the\n' +
        'run goes on to report the product; a note of the failure says nothing. Read `!x.ok` there, which a 0 and a\n' +
        "hand-made `{ status: 0 }` both make true, keeping the guard's own message — or, where the run goes on without the\n" +
        "step (a grant noted, not stopped), stop, or record it for the check that needs it to read. A guard whose status\n" +
        `cannot be 0 is marked ${FITS.guard.join(', ')}. Only a branch that stops on the failure or notes it is read so: one\n` +
        "that ends the run as a pass (`process.exit(0)`, a skip) or says yes on a refusal (`if (x.status >= 400) return true`,\n" +
        "`return 'refused'`) is no guard — a 0 goes on and fails — and `!x.ok` there would turn a dead API into the skip or\n" +
        'the refusal. A refusal said as no (`return false`) is read as a failure handed back: say it as the yes.',
    )
    process.exitCode = 1
    return false
  }
  const exempt = Object.entries(tally.exempt).sort()
  console.log(
    `[status-floor] ok — ${tally.suites} suite(s) read, ${tally.zeroClient} of them binding a client that answers 0; ` +
      `${tally.compared} status comparison(s) with an upper bound: ${tally.floored} with a lower bound beside it, ` +
      `${tally.cannotBeZero} on a status that cannot be 0; ` +
      `${tally.guards} guard(s) and ${tally.notes} note(s) reading a failure as a lower bound: ${tally.caught} with a 0 caught beside it, ` +
      `${tally.guardCannotBeZero} on a status that cannot be 0; ${tally.notGuards} branch(es) that skip or say yes on a refusal, no guards; ` +
      `${exempt.reduce((n, [, v]) => n + v, 0)} exempt${exempt.length ? ` (${exempt.map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`,
  )
  return true
}

/*
 * THE PLANTED SUITES. Each gets a directory of its own, and the gate — this
 * file, or under `--mutate` a broken copy of it — runs over it as a child,
 * exactly as it runs over `test/e2e`.
 */
const HEAD = ["import { apiAs as apiAsAt } from './lib/fixture.mjs'", 'const apiAs = apiAsAt(API)', 'const A = apiAs(token)']
const THROWS = ["import { apiAs as apiAsAt } from './lib/fixture.mjs'", "const apiAs = apiAsAt(API, { noAnswer: 'throw' })", 'const A = apiAs(token)']
const suite = (head, ...lines) => ({ 'c.mjs': [...head, ...lines].join('\n') })
const CASES = [
  ['caught', "the dependency-read-access guard: a refusal read as status < 400, on the default binding", suite(HEAD,
    'const gate = await M(`/tasks/${HIDDEN}`)',
    "if (gate.status < 400) throw new Error(`the member could open the hidden blocker (${said(gate)}), so nothing here would mean anything`)",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}gate\.status < 400/],
  ['caught', "flag-resolution's restore: a check resting on the status alone", suite(HEAD,
    'const healed = await platformOn()',
    "chk(!A || healed?.status < 300, 'and the platform’s Forms switch is back on for every workspace after this run')",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}healed\?\.status < 300/],
  ['caught', 'a status ANDed with a read-back, which a dead API would also fail', suite(HEAD,
    "const made = await A('/tasks', { method: 'POST', body: { title } })",
    "chk(made.status < 300 && made.data?.id, 'the task is made')",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}made\.status < 300/],
  ['caught', 'a status compared with <= 299', suite(HEAD, "const r = await A('/x')", "chk(r.status <= 299, 'x')"), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}r\.status <= 299/],
  ['caught', 'the bound written first: 300 > status', suite(HEAD, "const r = await A('/x')", "chk(300 > r.status, 'x')"), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}300 > r\.status/],
  ['caught', 'a status read inline off the call', suite(HEAD, "chk((await A('/x')).status < 300, 'x')"), /✗ c\.mjs:4 {2}ZERO-CLIENT {2}\(await A\('\/x'\)\)\.status < 300/],
  ['caught', 'and read off the call after return, which is no part of it', suite(HEAD,
    'const saved = async () => {',
    "  return (await A('/x')).status < 300",
    '}',
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}\(await A\('\/x'\)\)\.status < 300/],
  ['caught', 'in a waitUntil predicate that decides a check', suite(HEAD,
    "const saved = await waitUntil(async () => (await A('/x')).status < 300)",
    "chk(saved, 'it is saved')",
  ), /✗ c\.mjs:4 {2}ZERO-CLIENT /],
  ['caught', 'in a helper a check calls', suite(HEAD, 'const served = (res) => (modelOn ? res.status < 300 : res.status === 503)', "chk(served(await A('/x')), 'x')"), /✗ c\.mjs:4 {2}ZERO-CLIENT {2}res\.status < 300/],
  ['caught', 'every answer in a list, and a status held under a name of its own', suite(HEAD,
    "const answers = { memberAddsStatus: (await A('/s', { method: 'POST' })).status }",
    "chk(toggles.every((r) => r.status < 300) && answers.memberAddsStatus < 300, 'x')",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}r\.status < 300[\s\S]*✗ c\.mjs:5 {2}ZERO-CLIENT {2}answers\.memberAddsStatus < 300/],
  ['caught', "a default binding that asks for other options still answers 0", suite(
    ["import { apiAs as apiAsAt } from './lib/fixture.mjs'", "const apiAs = apiAsAt(API, { emptyBodyOn: ['POST', 'PATCH'] })", 'const A = apiAs(token)'],
    "const r = await A('/x')", "chk(r.status < 300, 'x')",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT /],
  ['caught', "the client imported by its own name and bound bare", suite(
    ["import { apiAs, must } from './lib/fixture.mjs'", 'const A = apiAs(API)(token)'],
    "const r = await A('/x')", "chk(r.status < 300, 'x')",
  ), /✗ c\.mjs:4 {2}ZERO-CLIENT /],
  ['caught', "a noAnswer: 'throw' suite whose step, not taken, stands in as { status: 0 }", suite(THROWS,
    "const removed = id ? await A(`/files/${id}`, { method: 'DELETE' }) : { status: 0 }",
    "chk(removed.status < 300, 'the file is removed')",
  ), /✗ c\.mjs:5 {2}PLACEHOLDER {2}removed\.status < 300/],
  ['caught', 'a put-back that threw, caught into { status: 0 }', suite(THROWS,
    'let putBack = null',
    'try {',
    "  putBack = await A('/settings', { method: 'PATCH', body })",
    '} catch (err) {',
    '  putBack = { status: 0, error: { message: String(err) } }',
    '}',
    "chk(!putBack || putBack.status < 300, 'and the setting is put back')",
  ), /✗ c\.mjs:10 {2}PLACEHOLDER {2}putBack\.status < 300/],
  ['caught', "a helper of the suite's own that hands back { status: 0 }", suite(THROWS,
    'const download = async (route) => {',
    '  const res = await fetch(`${API}${route}`).catch(() => null)',
    "  if (!res) return { status: 0, type: '' }",
    "  return { status: res.status, type: res.headers.get('content-type') ?? '' }",
    '}',
    "const csv = await download('/export')",
    "chk(csv.status < 300 && /csv/.test(csv.type), 'it downloads')",
  ), /✗ c\.mjs:10 {2}ZERO-HELPER {2}csv\.status < 300/],
  ['caught', 'a floor across an || does not count', suite(HEAD, "const r = await A('/x')", "chk(r.status >= 200 && fresh || r.status < 300, 'x')"), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}r\.status < 300/],
  ['caught', "a floor on another answer's status does not count", suite(HEAD, "const r = await A('/x')", "const q = await A('/y')", "chk(q.status >= 200 && r.status < 300, 'x')"), /✗ c\.mjs:6 {2}ZERO-CLIENT {2}r\.status < 300/],
  ['caught', 'a floor in the statement before does not count', suite(HEAD,
    'const saved = async (r) => {',
    "  r.status >= 200 && console.log('answered')",
    '  return r.status < 300',
    '}',
  ), /✗ c\.mjs:6 {2}ZERO-CLIENT {2}r\.status < 300/],
  ['caught', 'a floor that lets 0 through does not count', suite(HEAD,
    "const r = await A('/x')",
    "chk(r.status > -1 && r.status < 300, 'a')",
    "chk(r.status !== 404 && r.status < 300, 'b')",
    "chk(r.status >= 0 && r.status < 300, 'c')",
    "chk(-1 < r.status && r.status < 300, 'd')",
  ), /✗ c\.mjs:5 [\s\S]*✗ c\.mjs:6 [\s\S]*✗ c\.mjs:7 [\s\S]*✗ c\.mjs:8 /],
  ['caught', 'a marker with a reason nobody defined', suite(HEAD, "const r = await A('/x')", 'const through = r.status < 300 // status-floor: because', "chk(through, 'x')"), /not a reason this gate knows/],
  ['caught', 'a marker that exempts nothing', suite(HEAD, "const r = await A('/x')", 'const through = r.ok // status-floor: zero-fails', "chk(through, 'x')"), /exempts nothing/],
  ['caught', "a marker inside a check's arguments", suite(HEAD, "const r = await A('/x')", 'chk(', '  !(r.status < 300), // status-floor: zero-fails', "  'refused',", ')'), /inside a check's arguments/],
  ['caught', 'a directory with no suites in it', { 'README.md': 'nothing' }, /below the floor/],
  ['caught', 'a suite that does not lex to a clean end', suite(HEAD, 'const t = `left open ${WS}'), /could not be read as JavaScript/],
  ['caught', 'a status copied into a field of another name, and compared there (time-tracking-readers)', suite(HEAD,
    "const track = async () => { const stop = await A('/stop', { method: 'POST' }); return { stop: stop.status } }",
    'const g = await track()',
    "chk(g.stop < 300, 'the timer stops')",
  ), /✗ c\.mjs:\d+ {2}ZERO-\w+ {2}g\.stop < 300/],
  ['passes', 'that copied status floored, or its answer\'s ok copied instead', suite(HEAD,
    "const track = async () => { const stop = await A('/stop', { method: 'POST' }); return { stop: stop.status, stopped: stop.ok === true } }",
    'const g = await track()',
    "chk(g.stop >= 200 && g.stop < 300 && g.stopped, 'the timer stops')",
  )],
  ['passes', 'the same checks reading ok', suite(HEAD,
    'const gate = await M(`/tasks/${HIDDEN}`)',
    'if (gate.ok) throw new Error(`the member could open the hidden blocker (${said(gate)})`)',
    'const healed = await platformOn()',
    "chk(!A || healed?.ok === true, 'and the switch is back on')",
    "chk(toggles.every((r) => r.ok) && (await A('/x')).ok, 'x')",
  )],
  ['passes', 'a lower bound beside the upper one, in every spelling', suite(HEAD,
    "const r = await A('/x')",
    "chk(r.status >= 200 && r.status < 300, 'a')",
    "chk((r.status > 0) && (r.data?.id && r.status < 400), 'b')",
    "chk(r.status !== 0 && r.status < 300 && 0 < r.status, 'c')",
    "chk(r.status && r.status <= 299, 'd')",
    "chk(r.ok && r.status < 300, 'e')",
    "chk(100 <= r.status && 300 > r.status, 'f')",
    'const memberAddsStatus = answers.memberAddsStatus',
    "chk(memberAddsStatus >= 200 && memberAddsStatus < 300, 'g')",
  )],
  ['passes', "a noAnswer: 'throw' binding, whose client rejects instead of answering 0", suite(THROWS,
    "const r = await A('/x')",
    "chk(r.status < 300 && (await A('/y')).status < 400, 'x')",
    'const gate = await A(`/tasks/${HIDDEN}`)',
    "if (gate.status < 400) throw new Error('the member could open it')",
  )],
  ['passes', 'apiClient, which rejects when nothing answers', { 'c.mjs': ["import { apiClient } from './lib/fixture.mjs'", 'const api = apiClient(B, token)', "const r = await api('/x')", "chk(r.status < 300, 'x')"].join('\n') }],
  ['passes', "a page response's status(), which is never 0, held in a name of its own", suite(HEAD,
    "const answer = page.waitForResponse((r) => r.url().includes('/tasks')).catch(() => null)",
    'const usedStatus = (await answer)?.status() ?? null',
    "chk(usedStatus !== null && usedStatus < 300 && (await answer).status() < 300, 'x')",
  )],
  ['passes', 'a refusal, a placeholder read as a refusal, and a status that is not compared from above', suite(THROWS,
    "const refused = id ? await A('/x') : { status: 0 }",
    "chk(refused.status >= 400 && refused.status === 403 && [200, 204].includes(refused.status), 'x')",
  )],
  ['passes', 'a comparison a 0 cannot pass, hoisted and marked', suite(HEAD,
    "const answers = [await A('/x'), await A('/y')]",
    'const noneThrough = !answers.some((r) => r.status < 300) // status-floor: zero-fails — a 0 counts as through, and fails',
    "chk(noneThrough, 'none got through')",
  )],
  ['passes', "the shape in a comment, a string, a template, and a check's message", suite(HEAD,
    '// if (gate.status < 400) throw',
    "const said = 'if (gate.status < 400) throw'",
    'const tpl = `r.status < 300 ${WS}`',
    "const r = await A('/x')",
    "chk(r.ok, 'x', `it answered ${r.status < 300 ? 'yes' : 'no'}`)",
  )],

  /* RULE 2: a guard that reads failure as a lower bound alone (`found-30-sep/status-zero-slips-setup-guards`). */
  ['caught', "the nine grant guards: a failure read as status >= 300 on a grant never tried, standing in as { status: 0 }", suite(THROWS,
    "const role = await A('/roles', { method: 'POST', body: { permissions: [key] } })",
    "const granted = role.data?.id ? await A(`/members/${ROW}/roles/${role.data.id}`, { method: 'POST', body: {} }) : { status: 0 }",
    "if (granted.status >= 300) throw new Error(`could not grant the delegate: ${said(role)} ${said(granted)}`)",
  ), /✗ c\.mjs:6 {2}PLACEHOLDER {2}granted\.status >= 300/],
  ['caught', 'a setup guard on the default binding', suite(HEAD,
    "const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })",
    "if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}added\.status >= 300/],
  ['caught', 'a guard with a read-back beside it, which stands for the status only by coincidence', suite(HEAD,
    "const made = await A('/workspaces', { method: 'POST', body: { name } })",
    "if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}made\.status >= 300/],
  ['caught', 'a failure read as >= 400 and as > 299, and the bound written first either way', suite(HEAD,
    "const r = await A('/x')",
    "if (r.status >= 400) throw new Error('a')",
    "if (r.status > 299) throw new Error('b')",
    "if (300 <= r.status) throw new Error('c')",
    "if (299 < r.status) throw new Error('d')",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}r\.status >= 400[\s\S]*✗ c\.mjs:6 {2}ZERO-CLIENT {2}r\.status > 299[\s\S]*✗ c\.mjs:7 {2}ZERO-CLIENT {2}300 <= r\.status[\s\S]*✗ c\.mjs:8 {2}ZERO-CLIENT {2}299 < r\.status/],
  ['caught', "a guard whose block throws, a helper's that returns, and guards that exit or bail", suite(HEAD,
    "const r = await A('/x')",
    'if (r.status >= 300) {',
    '  console.log(`answered ${r.status}`)',
    "  throw new Error('could not stage x')",
    '}',
    'const presigned = async () => {',
    "  const p = await A('/presign', { method: 'POST' })",
    '  if (p.status >= 300) return null',
    '  return p.data',
    '}',
    "const q = await A('/y')",
    "if (q.status >= 300) { console.error('could not stage y'); process.exit(1) }",
    "const s = await A('/z')",
    'if (s.status >= 300) await bail(1)',
  ), /✗ c\.mjs:5 [\s\S]*✗ c\.mjs:11 [\s\S]*✗ c\.mjs:15 [\s\S]*✗ c\.mjs:17 /],
  ['caught', 'a guard over a list of answers, through .some()', suite(HEAD,
    "const gone = [await A('/a', { method: 'DELETE' }), await A('/b', { method: 'DELETE' })]",
    "if (gone.some((r) => r.status >= 300)) throw new Error(`could not delete: ${gone.map(said).join(', ')}`)",
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}r\.status >= 300/],
  ['caught', "no catcher: another answer's !ok, an !ok ANDed with something else, a comparison a 0 does not make true", suite(HEAD,
    "const r = await A('/x')",
    "const q = await A('/y')",
    "if (r.status >= 300 || !q.ok) throw new Error('a')",
    "if (r.status >= 300 || (!r.ok && fresh)) throw new Error('b')",
    "if (r.status >= 300 || r.status === 204 || 204 === r.status) throw new Error('c')",
  ), /✗ c\.mjs:6 {2}ZERO-CLIENT {2}r\.status >= 300[\s\S]*✗ c\.mjs:7 {2}ZERO-CLIENT {2}r\.status >= 300[\s\S]*✗ c\.mjs:8 {2}ZERO-CLIENT {2}r\.status >= 300/],
  ['caught', 'a zero-fails marker on a guard, where the 0 it lets through is the defect itself', suite(HEAD,
    "const r = await A('/x')",
    "if (r.status >= 300) throw new Error('x') // status-floor: zero-fails",
  ), /^(?=[\s\S]*c\.mjs:5 {2}\/\/ status-floor: zero-fails — exempts nothing)(?=[\s\S]*✗ c\.mjs:5 {2}ZERO-CLIENT {2}r\.status >= 300)/],
  ['caught', 'a status copied into a field of another name, and guarded there', suite(HEAD,
    "const stage = async () => { const s = await A('/x', { method: 'POST' }); return { made: s.status, id: s.data?.id } }",
    'const g = await stage()',
    "if (g.made >= 300) throw new Error('could not stage')",
  ), /✗ c\.mjs:6 {2}ZERO-CLIENT {2}g\.made >= 300/],
  ['passes', 'the same guards reading !ok, the grant on its placeholder among them', suite(HEAD,
    "const role = await A('/roles', { method: 'POST' })",
    "const granted = role.data?.id ? await A('/grant', { method: 'POST' }) : { status: 0 }",
    'if (!granted.ok) throw new Error(`could not grant the delegate: ${said(granted)}`)',
    "const made = await A('/workspaces', { method: 'POST' })",
    "if (!made.ok || !made.data?.id) throw new Error('could not make the workspace')",
    "const gone = [await A('/a', { method: 'DELETE' })]",
    "if (gone.some((r) => !r.ok)) throw new Error('could not delete')",
  )],
  ['passes', 'a 0 caught beside the lower bound, in every spelling', suite(HEAD,
    "const r = await A('/x')",
    "if (r.status >= 300 || !r.ok) throw new Error('a')",
    "if (r.status === 0 || r.status >= 300) throw new Error('b')",
    "if (!r.status || r.status >= 400) throw new Error('c')",
    "if (r.status >= 300 || 0 === r.status) throw new Error('d')",
    "if ((r.status >= 300 || r.status == 0) && strict) throw new Error('e')",
    "if (r.status >= 300 || r.status !== 201) throw new Error('f')",
    "if ((r.status >= 300) || (!r?.ok)) throw new Error('g')",
    "if (gone.some((x) => x.status >= 300 || !x.ok)) throw new Error('h')",
  )],
  ['caught', "the data-transfer-keys grant: a grant never tried, standing in as { status: 0 }, noted on >= 300 and so not noted at all", suite(THROWS,
    "const r = await A('/roles', { method: 'POST', body: { permissions: ['workspace.import'] } })",
    "const given = r.data?.id ? await A(`/members/${ROW}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }",
    'if (given.status >= 300) console.log(`    (not granted in the empty workspace: ${said(r)})`)',
  ), /✗ c\.mjs:6 {2}PLACEHOLDER {2}given\.status >= 300 — a note of a failure/],
  ['caught', 'a cleanup note on the default binding, itself or in a block', suite(HEAD,
    "const gone = await A('/x', { method: 'DELETE' })",
    'if (gone.status >= 300) console.log(`  note: cleanup answered ${gone.status}`)',
    'if (gone.status >= 400) {',
    '  console.error(`  cleanup left behind: ${gone.status}`)',
    '}',
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}gone\.status >= 300 — a note[\s\S]*✗ c\.mjs:6 {2}ZERO-CLIENT {2}gone\.status >= 400 — a note/],
  ['caught', 'a yes said on a failure (>= 300), not a refusal, is a failure handed on: a guard in two steps', suite(HEAD,
    "const failed = async (route) => { const r = await A(route); if (r.status >= 300) return true; return false }",
    "if (await failed('/x')) throw new Error('could not stage x')",
  ), /✗ c\.mjs:4 {2}ZERO-CLIENT {2}r\.status >= 300 — a guard/],
  ['caught', "on a refusal's bound, a branch that hands back false, nothing, an empty string or the answer stops on failure", suite(HEAD,
    "const staged = async () => { const p = await A('/p', { method: 'POST' }); if (p.status >= 400) return false; await A('/q'); return true }",
    "const made = async () => { const p = await A('/p', { method: 'POST' }); if (p.status >= 400) return; return p.data }",
    "const mkList = async () => { const proj = await A('/projects', { method: 'POST' }); if (proj.status >= 400) return { proj, list: null }; return { proj, list: await A('/lists') } }",
    "const named = async () => { const p = await A('/p'); if (p.status >= 400) return ''; return 'named' }",
  ), /✗ c\.mjs:4 {2}ZERO-CLIENT {2}p\.status >= 400 — a guard[\s\S]*✗ c\.mjs:5 [\s\S]*✗ c\.mjs:6 {2}ZERO-CLIENT {2}proj\.status >= 400[\s\S]*✗ c\.mjs:7 /],
  ['caught', 'an exit whose code is computed, and a bare bail, stop on failure', suite(HEAD,
    "const s = await A('/z')",
    'if (s.status >= 400) process.exit(failed ? 1 : 0)',
    'if (s.status >= 400) await bail()',
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}s\.status >= 400 — a guard[\s\S]*✗ c\.mjs:6 {2}ZERO-CLIENT {2}s\.status >= 400 — a guard/],
  ['caught', 'a stop on failure anywhere in a block makes it a guard, a skip beside it notwithstanding', suite(HEAD,
    "const probe = await A('/model')",
    'if (probe.status >= 400) {',
    "  if (strict) throw new Error('this lane was to have a model')",
    "  console.log('SKIP — this lane has no model')",
    '  process.exit(0)',
    '}',
  ), /✗ c\.mjs:5 {2}ZERO-CLIENT {2}probe\.status >= 400 — a guard/],
  ['passes', "not guards (the review's planted suites): a refusal helper, a .map verdict and a waitUntil predicate that say yes on a refusal, and skips that exit 0", suite(HEAD,
    'const refused = async (route) => { const r = await M(route); if (r.status >= 400) return true; return false }',
    "chk(await refused(`/tasks/${HIDDEN}`), 'the member is refused the hidden task')",
    "const verdicts = await Promise.all(routes.map(async (route) => { const r = await M(route); if (r.status >= 400) return 'refused'; return `let in (${r.status})` }))",
    "chk(verdicts.every((v) => v === 'refused'), 'the member is refused every route')",
    "const shut = await waitUntil(async () => { const r = await M('/x'); if (r.status > 399) return true; return false })",
    "chk(shut, 'the member is refused once the share is withdrawn')",
    "const probe = await A('/model')",
    "if (probe.status >= 400) { console.log('SKIP — this lane has no model'); process.exit(0) }",
    'if (400 <= probe.status) await bail(0)',
  )],
  ['passes', 'a note that says a 0 too, and a grant recorded for its check rather than noted (data-transfer-keys, after)', suite(HEAD,
    "const gone = await A('/x', { method: 'DELETE' })",
    'if (gone.status >= 300 || gone.status === 0) console.log(`  note: cleanup answered ${gone.status}`)',
    "const r = await A('/roles', { method: 'POST' })",
    "const given = r.data?.id ? await A('/grant', { method: 'POST' }) : { status: 0 }",
    'const granted = given.ok === true',
    'if (!granted) console.log(`    (not granted in the empty workspace: ${said(r)} ${said(given)})`)',
    "chk(granted && shown === 1, 'the member granted it is offered it', `importer ${granted ? shown : 'NOT GRANTED'}`)",
  )],
  ['passes', 'not guards: a refusal check, a refusal collected, a floor, a bound under a ! or deciding a ternary', suite(HEAD,
    "const r = await A('/x')",
    "chk(r.status >= 400, 'the member is refused')",
    'if (r.status >= 400) refused.push(r.status)',
    'const read = async () => { if (r.status >= 200 && r.status < 300) return r.data; return null }',
    "if (!(r.status >= 300)) throw new Error('it went through, which it should not have')",
    "if (r.status >= 300 ? strict : false) throw new Error('refused, and this run is strict')",
  )],
  ['passes', "a guard on a noAnswer: 'throw' binding, whose client rejects instead of answering 0", suite(THROWS,
    "const added = await A('/members', { method: 'POST' })",
    'if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)',
  )],
  ['passes', "a guard's shape in a comment, a string and a template", suite(HEAD,
    '// if (added.status >= 300) throw new Error()',
    "const said = 'if (added.status >= 300) throw'",
    'const tpl = `if (added.status >= 300) throw ${WS}`',
  )],
]

function runCases(gate) {
  let fail = 0
  const seen = {}
  console.log(`\n▶ planted suites, each run through ${gate === SELF ? 'this gate' : 'the gate under test'}`)
  for (const [want, name, files, pattern] of CASES) {
    const dir = mkdtempSync(join(tmpdir(), 'status-floor-'))
    let r
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), `${text}\n`)
      }
      const env = { ...process.env, SUITE_DIR: dir }
      delete env.STATUS_FLOOR_UNDER_TEST
      r = spawnSync(process.execPath, [gate], { encoding: 'utf8', env, timeout: 60_000 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const ok = want === 'caught' ? r.status === 1 && pattern.test(out) : r.status === 0 && /\[status-floor\] ok/.test(out)
    seen[name] = { ok, first: out.split('\n').find((l) => l.startsWith('✗') || l.startsWith('[status-floor] ok')) ?? '' }
    if (ok) console.log(`  \x1b[32mPASS\x1b[0m ${want === 'caught' ? 'caught' : 'passes'}: ${name}`)
    else {
      fail += 1
      console.log(`  \x1b[31mFAIL\x1b[0m ${want === 'caught' ? 'not caught' : 'did not pass'}: ${name} — exit ${r.status}: ${out.trim().split('\n')[0]}`)
    }
  }
  console.log(`\n${CASES.length - fail} passed, ${fail} failed`)
  return { fail, seen }
}

if (process.env.STATUS_FLOOR_UNDER_TEST) {
  // One pass of the cases against a broken copy, started by `proveMutationsBite` below.
  process.exitCode = runCases(process.env.STATUS_FLOOR_UNDER_TEST).fail ? 1 : 0
} else {
  const realOk = report(scan(SUITES))
  if (process.argv.includes('--mutate')) {
    const { fail, seen } = runCases(SELF)
    const planted = seen[CASES[0][1]]
    const fixed = seen[CASES.find(([want]) => want === 'passes')[1]]
    const grant = seen[CASES.find(([, name]) => name.startsWith('the nine grant guards'))[1]]
    const granted = seen[CASES.find(([, name]) => name.startsWith('the same guards reading !ok'))[1]]
    const noted = seen[CASES.find(([, name]) => name.startsWith('the data-transfer-keys grant'))[1]]
    const verdicts = seen[CASES.find(([, name]) => name.startsWith("not guards (the review's planted suites)"))[1]]
    console.log(
      `[status-floor] mutate: the planted dependency-read-access guard was ${planted.ok ? 'caught' : 'NOT caught'} — ${planted.first}\n` +
        `[status-floor] mutate: the same conditions reading ok ${fixed.ok ? 'pass' : 'do NOT pass'} — ${fixed.first}\n` +
        `[status-floor] mutate: the planted grant guard on { status: 0 } was ${grant.ok ? 'caught' : 'NOT caught'} — ${grant.first}\n` +
        `[status-floor] mutate: the same guards reading !ok ${granted.ok ? 'pass' : 'do NOT pass'} — ${granted.first}\n` +
        `[status-floor] mutate: the planted grant noted on { status: 0 } was ${noted.ok ? 'caught' : 'NOT caught'} — ${noted.first}\n` +
        `[status-floor] mutate: the planted refusal helper, verdicts and skips ${verdicts.ok ? 'pass' : 'do NOT pass'} — ${verdicts.first}`,
    )
    const alive = (mutant) => {
      const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8', timeout: 120_000 })
      return { ok: /\[status-floor\]|✗/.test(r.stdout ?? ''), why: r.stderr }
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
      envVar: 'STATUS_FLOOR_UNDER_TEST',
      label: 'this gate',
      alive,
      mutations: [
        ['lt-unread', at("if (op[0] === '<') {\n      // `x.status < 300`: a number after", ', the status before\n'), "if (false) {\n"],
        ['lte-unread', at('for (const m of code.matchAll(/(?<![<>=!])(<=?|>=?)', '(?![<>=])/g)) {'), 'for (const m of code.matchAll(/(?<![<>=!])(<|>=?)(?![<>=])/g)) {'],
        ['reversed-unread', at("if (!/^\\d[\\d_.]*$/.test(wordBefore(code, n).word)) ", 'continue'), 'continue'],
        ['keywords-in-chains', at('if (isWord(code[k]) && KEYWORDS.has(wordBefore(code, k).word)) ', 'return o'), ''],
        ['named-statuses-unread', at("if (!last || !(last === 'status' || /Status$/.test(last) || (operand.includes('.') && statusFields", ".has(last)))) return false"), "if (!last || !(last === 'status' || (operand.includes('.') && statusFields.has(last)))) return false"],
        ['copied-statuses-unread', at("/Status$/.test(last) || (operand.includes('.') && ", 'statusFields.has(last)))) return false'), "/Status$/.test(last) || false)) return false"],
        ['page-statuses-counted', at("return !(last !== 'status' && !statusFields.has(last) && ", 'pageStatus(last))'), 'return true'],
        ['zero-client-off', at('if (!options || !/noAn', "swer\\s*:\\s*['\"]throw['\"]/.test(src.slice(...options))) zeroClient = true"), 'if (false) zeroClient = true'],
        ['any-options-throw', at('if (!options || ', '!/noAnswer'), 'if (!options || false && !/noAnswer'],
        ['own-name-unread', at("if (s) local.add(s[1] ?? ", "'apiAs')"), 'if (s && s[1]) local.add(s[1])'],
        ['placeholders-unread', at('if (ZERO.test(text)) ', "return 'PLACEHOLDER'"), 'if (false) return null'],
        ['every-name-a-placeholder', at("      if (ZERO.test(text)) return 'PLACE", "HOLDER'"), "      if (true) return 'PLACEHOLDER'"],
        ['helpers-unread', at('if (call && zeroFns.has(call[1])) ', "return 'ZERO-HELPER'"), 'if (false) return null'],
        ['floors-unread', at('const floored = conjunctsAround(code, at).some(([a, b]) => ', 'floorLeaf(norm(src.slice(a, b))))'), 'const floored = false'],
        ['other-answers-floor', at('const same = (x) => ', 'x === operand'), 'const same = (x) => /status$/i.test(x)'],
        ['truthy-not-a-floor', at('if ((f = /^(?:!!)?(.+)$/.exec(t)) && same(f[1])) ', 'return true'), 'if (false) return true'],
        ['nonpositive-floors', at("return f[2] === '>' ? Number(f[3]) >= 0 : ", 'Number(f[3]) > 0'), 'return true'],
        ['nonpositive-floors-reversed', at("return f[2] === '<' ? Number(f[1]) >= 0 : ", 'Number(f[1]) > 0'), 'return true'],
        ['any-inequality-floors', at('&& same(f[1])) return Number(f[2]) ', '=== 0'), '&& same(f[1])) return true'],
        ['ok-not-a-floor', at('if (base && (f = /^(.+)\\.ok(?:===true)?$/.exec(t)) && f[1] === base) ', 'return true'), 'if (false) return true'],
        ['groups-not-stepped-through', at("if (open < 0 || code[open] !== '(' || ", '!isGroup(code, open)) break'), 'if (true) break'],
        ['disjunctions-joined', at("else if ((c === '|' && code[k + 1] === '|') || ", "(c === '?' && code[k + 1] === '?')) cut = 2"), "else if (c === '?' && code[k + 1] === '?') cut = 2"],
        ['statements-joined', at('if (last && !/[=(\\[{,?:&|+\\-*/.<>!]/.test(last) && ', "!/[.?:&|+*,=]/.test(code[skipFwd(code, k + 1)] ?? '')) cut = 1"), 'if (false) cut = 1'],
        ['messages-decide', at('if (where !== null && where >= 1) ', 'continue'), 'if (false) continue'],
        ['strings-are-code', at("        if (c === quote) prev = c\n        word = ''\n      } else ", 'blank(i)'), "        if (c === quote) prev = c\n        word = ''\n      }"],
        ['templates-are-code', at("        i += 1\n      } else ", 'blank(i, false)'), '        i += 1\n      }'],
        ['comments-are-code', at("      if (c === '\\n') mode = 'code'\n", '      else blank(i)'), "      if (c === '\\n') mode = 'code'"],
        ['any-reason-will-do', at('} else if (!REASONS.includes(mk.reason)) {\n', '        problems.push'), '} else if (false) {\n        problems.push'],
        ['stale-markers-pass', at('} else if (!mk.used) {', '\n'), '} else if (false) {\n'],
        ['markers-anywhere', at('      if (mk.inCheck) {', '\n        problems.push('), '      if (false) {\n        problems.push('],
        ['unlexed-read-anyway', at('    if (!found.clean) ', '{'), '    if (false) {'],
        ['no-floor', at('const MIN_SUITES = ', 'process.env.SUITE_DIR ? 1 : 100'), 'const MIN_SUITES = 0'],
        ['violations-exit-zero', at('    process.exitCode = 1\n', '    return false'), '    process.exitCode = 0\n    return false'],
        // Rule 2: a guard that reads failure as a lower bound alone.
        ['guards-unread', at('if (!(least >= ', '300)) continue'), 'continue'],
        ['floors-read-as-failures', at('if (!(least >= ', '300)) continue'), 'if (!(least >= 0)) continue'],
        ['guard-bounds-off-by-one', at('const least = cmp.length === 2 ? Number(bound) : ', 'Number(bound) + 1'), 'const least = Number(bound)'],
        ['guard-bounds-first-unread', at('if (!/^\\d[\\d_.]*$/.test(left', '.word)) continue'), 'continue'],
        ['guards-need-no-if', at("if (isWord(code[kw]) && wordBefore(code, kw).word === ", "'if') return { close, levels }"), "if (isWord(code[kw]) && wordBefore(code, kw).word === 'while') return { close, levels }"],
        ['any-if-a-guard', at('const kind = guard && ', 'branchKind(guard.close, least)'), "const kind = guard && (branchKind(guard.close, least) ?? 'fail')"],
        ['consequents-unread', at("if (code[j] !== '{') ", 'return statementKind(j, least)'), "if (code[j] !== '{') return null"],
        ['blocks-unread', at("if (code[j] !== '{') ", 'return statementKind(j, least)'), 'return statementKind(j, least)'],
        ['throws-go-on', at('if (/^throw(?![\\w$])/.test(text)) ', "return 'fail'"), "if (false) return 'fail'"],
        ['returns-go-on', at('if (/^return(?![\\w$])/', '.test(text)) {'), 'if (false) {'],
        ['exits-go-on', at('const ENDS = /^(?:(?:await\\s+)?bail|', 'process\\s*\\.\\s*exit)\\s*\\(/'), 'const ENDS = /^(?:(?:await\\s+)?bail)\\s*\\(/'],
        ['bails-go-on', at('const ENDS = /^(?:', '(?:await\\s+)?bail|process'), 'const ENDS = /^(?:process'],
        // What the branch is for: a skip or a yes on a refusal is no guard; everything else that stops, and a note, is.
        ['skips-are-failures', at(".trim() === '0' ? ", "'skip' : 'fail'"), ".trim() === '0' ? 'fail' : 'fail'"],
        ['every-exit-a-skip', at('return close > 0 && code.slice(open + 1, close).trim() ', "=== '0' ? 'skip' : 'fail'"), "return 'skip'"],
        ['verdicts-are-failures', at(".test(value) ? 'verdict'", " : 'fail'"), ".test(value) ? 'fail' : 'fail'"],
        ['verdicts-on-any-bound', at('return least >= ', '400 && /^(?:true'), 'return /^(?:true'],
        ['any-value-a-verdict', at('/^(?:true|', "(['\"`])[^]+\\1)$/"), '/^(?:[^]+)$/'],
        ['empty-strings-verdicts', at("(['\"`])[^]", '+\\1)$/'), "(['\"`])[^]*\\1)$/"],
        ['bare-returns-verdicts', at("if (from >= code.length || ';}\\n'.includes(code[from])) ", "return 'fail'"), "if (from >= code.length || ';}\\n'.includes(code[from])) return 'verdict'"],
        ['notes-unread', at('if (NOTES.test(text)) ', "return 'note'"), "if (false) return 'note'"],
        ['notes-outrank-skips', at('const RANK = { fail: 3, ', 'skip: 2, verdict: 2, note: 1 }'), at('const RANK = { fail: 3, ', 'skip: 2, verdict: 2, note: 2.5 }')],
        ['failures-outranked', at('const RANK = { ', 'fail: 3, skip: 2'), 'const RANK = { fail: 1.5, skip: 2'],
        ['first-statement-decides', at('if (here && (!kind || ', 'RANK[here] > RANK[kind])) kind = here'), 'if (here && !kind) kind = here'],
        ['skips-counted-as-guards', at("if (kind === 'skip' || ", "kind === 'verdict') {"), "if (kind === 'verdict') {"],
        ['verdicts-counted-as-guards', at("if (kind === 'skip' || ", "kind === 'verdict') {"), "if (kind === 'skip') {"],
        ['negations-read', at('if (!(before < from || ', 'joins(before - 1))) return null'), 'if (false) return null'],
        ['ternaries-read', at('if (!(after >= close || ', 'joins(after))) return null'), 'if (false) return null'],
        ['callbacks-unread', at("else if (d === 0 && code[k] === '=' && ", "code[k + 1] === '>') arrow = k"), 'else if (false) arrow = k'],
        ['some-unread', at("if (fn.word !== 'some' || code[skipBack(code, fn.at - 1)] !== '.') ", 'return null'), 'return null'],
        ['catchers-unread', at('if (guard.levels.some(([x, y]) => ', 'disjuncts(x, y).some(([p, q]) => catches(norm(src.slice(p, q)))))) {'), 'if (false) {'],
        ['other-answers-catch', at("if (base && (f = /^!(.+)\\.ok$/.exec(t)) ", '&& f[1] === base) return true'), 'if (base && (f = /^!(.+)\\.ok$/.exec(t))) return true'],
        ['read-backs-catch', at('if ((f = /^!(.+)$/.exec(t)) ', '&& f[1] === operand) return true'), 'if ((f = /^!(.+)$/.exec(t))) return true'],
        ['nonzero-catchers', at('return holds(0, f[2], ', 'Number(f[3]))'), 'return true'],
        ['nonzero-catchers-reversed', at('return holds(Number(f[1]), ', 'f[2], 0)'), 'return true'],
        ['catchers-across-and', at("else if (d === 0 && code[k] === '|' ", "&& code[k + 1] === '|') {"), "else if (d === 0 && '|&'.includes(code[k]) && code[k + 1] === code[k]) {"],
        ['catcher-groups-unopened', at("if (code[ta] === '(' && matchForward(code, ta) === tb - 1 && isGroup(code, ta)) ", 'out.push(...disjuncts(ta + 1, tb - 1))'), 'if (false) out.push(...disjuncts(ta + 1, tb - 1))'],
        ['guards-ignore-the-client', at('if (!zero) ', '{'), 'if (false) {'],
        ['guard-takes-any-reason', at('const FITS = { upper: REASONS, guard: ', "['not-a-client'] }"), 'const FITS = { upper: REASONS, guard: REASONS }'],
      ],
    })
    if (!realOk || fail || blind) process.exitCode = 1
  }
}
