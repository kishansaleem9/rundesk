#!/usr/bin/env node
/*
 * NO SUITE HAND-ROLLS AN API CLIENT (`suite-hygiene/apiAs-duplicated-62`).
 *
 * `lib/fixture.mjs` exports the one: `apiAs(base)(token)`, which answers
 * `{ status, ok, data, error, message, text, type }` for every status, with
 * `must(res, what)` beside it. On 29 September 172 suites carried a copy of
 * their own, `const apiAs = (token) => async (route, init = {}) => { … fetch
 * … }`, in 21 variants once comments and spacing were set aside, and 13 more
 * suites hand-rolled the same thing under other names (ten `call`s, an `A`,
 * an `asMember`, two `api`s). The copies disagreed where no caller looks: 87
 * sent `Bearer null` for a null token; 67 rejected when nothing answered and
 * 105 answered 0; some parsed the body as text and kept it, one kept the whole
 * body as `data`. A new suite copied whichever it was nearest, which is how the
 * ledger's 62 became 172. Each suite now binds the fixture's, and a difference
 * its checks stood on is an option, written where it binds (see the fixture's
 * own comment).
 *
 * THE RULE, over every suite read as code:
 *
 *   NAME   `apiAs` bound to a function the suite writes: `const apiAs =
 *          (token) => …`, `apiAs = async function …`, `function apiAs(…)`.
 *          Binding it to a call — `const apiAs = apiAsAt(API)`, the fixture's
 *          bound to this lane — is how a suite gets it.
 *   SHAPE  by any name, a function that calls `fetch` on a URL its caller
 *          routes — a template that ends in one of the function's own
 *          parameters (`${API}${route}`), `API + route`, or the parameter
 *          itself — and hands back `data`. That is the client by another name.
 *
 * NOT REFUSED: a helper that calls `fetch` for what the one client does not
 * do. A stub's control route (`${MODEL}/__control/${route}`, handing back
 * `r.ok`), a fixed route with handling of its own (sign-up, inbound mail, an
 * OAuth callback left unfollowed), a file's bytes (`download`, `list-export`'s
 * `raw`), a presigned upload. None of them routes its caller's path to the API
 * and hands back the envelope's `data`. And an adapter that keeps a suite's own
 * call shape over the one client (`syncup-live`'s `api(token, method, path,
 * body)`) calls no `fetch` at all.
 *
 * READ AS JAVASCRIPT, NOT AS LINES: comments, strings, regex literals and
 * template text are blanked before anything is matched (`lex`, copied from
 * `check-suite-api-catches`, which runs when imported), so the shape in a
 * sentence or a string is not a site. A template's `${…}` stays code, which is
 * how a URL that ends in a parameter is told from one with text after it
 * (`${API}/ical/${token}.ics`). A suite that does not lex to a clean end is
 * reported, not guessed at.
 *
 * A GATE THAT READ NOTHING ANSWERS ok AS SURELY AS ONE THAT READ EVERYTHING:
 * fewer than 100 suites read is a failure (1 under `SUITE_DIR`).
 *
 * `--mutate` plants suites in a temp directory, requires each shape above to be
 * caught and the bound client, an adapter over it and the helpers above to
 * pass, then breaks this file one rule at a time and requires a planted case to
 * notice (`lib/mutate.mjs`).
 *
 *   node scripts/check-suite-api-clients.mjs [--mutate]
 *   SUITE_DIR=<dir> node scripts/check-suite-api-clients.mjs
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
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'await', 'yield'])
const IDENT = /^[A-Za-z_$][\w$]*$/

/*
 * `src` with comments, string and regex contents and template text blanked,
 * exactly as long, so an index means the same place in both. `clean` says
 * whether the walk ended outside every string and comment; `regexEnds` holds
 * where each regex literal closes, since a `/` that ends a value does not
 * carry a statement on.
 */
export function lex(src) {
  const code = src.split('')
  // Newlines survive in comments and strings, so a line is still a line; in
  // template text they go too, so a wrapped sentence does not end a statement.
  const blank = (i, keepNewline = true) => {
    if (i < code.length && !(keepNewline && code[i] === '\n')) code[i] = ' '
  }
  const regexEnds = new Set()
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
  return { code: code.join(''), clean: mode === 'code' && frames.length === 0, regexEnds }
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
  let nl = false
  for (; i < code.length && /\s/.test(code[i]); i++) if (code[i] === '\n') nl = true
  return { i, nl }
}
const skipBack = (code, i) => {
  for (; i >= 0 && /\s/.test(code[i]); i--);
  return { i }
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
/** The spans between the top-level commas of a bracket from `open` to `close`. */
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
 * Where an expression that starts at `from` ends: a `,` or `;` outside every
 * bracket it opened, a closing bracket it did not open, or a newline nothing
 * carries on over (copied from `check-suite-api-catches`).
 */
const exprEnd = (code, from, regexEnds) => {
  let d = 0
  let last = ''
  for (let k = from; k < code.length; k++) {
    const c = code[k]
    if (c === '\n' && d === 0 && last) {
      const next = code[skipFwd(code, k + 1).i] ?? ''
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

/** The names a parameter list binds at its top level: `(route, init = {})` is route and init. */
const paramNames = (code, open, close) =>
  argSpans(code, open, close)
    .map(([a, b]) => /^(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)/.exec(code.slice(a, b).trim())?.[1])
    .filter(Boolean)

/** Every function in `code`: where it starts, the names its parameters bind, where its body starts and ends. */
function functionsIn(code, regexEnds) {
  const fns = []
  for (const m of code.matchAll(/(?<![\w$.])(?:async\s+)?function\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const open = m.index + m[0].length - 1
    const close = matchForward(code, open)
    const b = close < 0 ? -1 : skipFwd(code, close + 1).i
    const end = code[b] === '{' ? matchForward(code, b) : -1
    if (end > 0) fns.push({ start: m.index, name: m[1] ?? null, params: paramNames(code, open, close), bodyStart: b, end: end + 1 })
  }
  for (const m of code.matchAll(/=>/g)) {
    const j = skipBack(code, m.index - 1).i
    let start
    let params
    if (code[j] === ')') {
      start = matchBack(code, j)
      if (start < 0) continue
      params = paramNames(code, start, j)
    } else if (isWord(code[j])) {
      const w = wordBefore(code, j)
      start = w.at
      params = [w.word]
    } else continue
    const before = wordBefore(code, skipBack(code, start - 1).i)
    const b = skipFwd(code, m.index + 2).i
    const end = code[b] === '{' ? matchForward(code, b) + 1 : trimmed(code, b, exprEnd(code, b, regexEnds))[1]
    if (end > b) fns.push({ start: before.word === 'async' ? before.at : start, name: null, params, bodyStart: b, end })
  }
  return fns.sort((x, y) => x.start - y.start)
}

/** Every hand-rolled API client in one suite. */
export function handRolledIn(src) {
  const { code, clean, regexEnds } = lex(src)
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
  const textAt = (i) => {
    const line = src.slice(src.lastIndexOf('\n', i - 1) + 1, src.indexOf('\n', i) < 0 ? src.length : src.indexOf('\n', i)).trim()
    return line.length > 110 ? `${line.slice(0, 109)}…` : line
  }
  const fns = functionsIn(code, regexEnds)
  const fnAt = new Map(fns.map((f) => [f.start, f]))
  /** The innermost function around `p`: the last, in source order, that holds it. */
  const innermost = (p) => {
    let best = null
    for (const f of fns) {
      if (f.start > p) break
      if (p < f.end) best = f
    }
    return best
  }
  const sites = []

  /*
   * NAME: `apiAs` given a function written here. A call on the right is the
   * fixture's client being bound, and passes.
   */
  for (const m of code.matchAll(/(?<![\w$.])(?:async\s+)?function\s*\*?\s*apiAs\s*\(/g)) {
    sites.push({ at: m.index, rule: 'NAME' })
  }
  for (const m of code.matchAll(/(?<![\w$.])apiAs\s*=(?![=>])/g)) {
    const rhs = skipFwd(code, m.index + m[0].length).i
    if (fnAt.has(rhs)) sites.push({ at: m.index, rule: 'NAME' })
  }

  /*
   * SHAPE: a `fetch` whose URL the enclosing function's caller routes, in a
   * function that hands back `data`.
   */
  /** Which parameter routes the URL from `a` to `b`, or null. */
  const routedBy = (a, b, params) => {
    const t = code.slice(a, b)
    if (IDENT.test(t)) return params.includes(t) ? t : null // fetch(url)
    const plus = /\+\s*([A-Za-z_$][\w$]*)$/.exec(t) // fetch(API + route)
    if (plus) return params.includes(plus[1]) ? plus[1] : null
    if (code[a] !== '`' || code[b - 1] !== '`') return null
    // A template that ENDS in the parameter: its last `${…}` closes right at
    // the backtick. Template text is blanked, so a `${` in the code is one.
    const o = code.lastIndexOf('${', b - 2)
    if (o <= a) return null
    const close = matchForward(code, o + 1)
    if (close !== b - 2) return null // text after it: `${API}/ical/${token}.ics`
    const inner = code.slice(o + 2, close).trim()
    return params.includes(inner) ? inner : null
  }
  const handsBackData = (f) => /[{,]\s*data\s*[:,}]/.test(code.slice(f.start, f.end))
  const seen = new Set()
  for (const m of code.matchAll(/(?<![\w$.])fetch\s*\(/g)) {
    const open = m.index + m[0].length - 1
    const close = matchForward(code, open)
    if (close < 0) continue
    const f = innermost(m.index)
    if (!f || seen.has(f)) continue
    const [a, b] = trimmed(code, ...argSpans(code, open, close)[0])
    const by = routedBy(a, b, f.params)
    if (by && handsBackData(f)) {
      seen.add(f)
      sites.push({ at: m.index, rule: 'SHAPE', why: `routed by \`${by}\`, hands back \`data\`` })
    }
  }
  return {
    sites: sites.sort((x, y) => x.at - y.at).map((s) => ({ line: lineOf(s.at), rule: s.rule, text: textAt(s.at) })),
    clean,
  }
}

/** The gate over one directory: every site and problem, and how many suites were read. */
export function scan(dir) {
  const problems = []
  const sites = []
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
    const found = handRolledIn(readFileSync(join(dir, file), 'utf8'))
    if (!found.clean) {
      problems.push(`${file}  could not be read as JavaScript — it ends inside a string, comment or template, so any answer about it would be a guess`)
      continue
    }
    for (const s of found.sites) sites.push({ file, ...s })
  }
  return { problems, sites, suites: files.length }
}

function report({ problems, sites, suites }) {
  for (const p of problems) console.log(`✗ ${p}`)
  for (const s of sites) console.log(`✗ ${s.file}:${s.line}  ${s.rule}  ${s.text}`)
  if (problems.length || sites.length) {
    const of = (rule) => sites.filter((s) => s.rule === rule).length
    console.error(
      `\n[api-clients] ${sites.length} hand-rolled API client site(s) in ${new Set(sites.map((s) => s.file)).size} suite(s): ` +
        `${of('NAME')} \`apiAs\` written in the suite, ${of('SHAPE')} client(s) by shape` +
        `${problems.length ? `; and ${problems.length} other problem(s)` : ''}.\n` +
        "The API client is lib/fixture.mjs's `apiAs(base)(token)`. Import it (`import { apiAs as apiAsAt } from\n" +
        "'./lib/fixture.mjs'`) and bind it to this lane (`const apiAs = apiAsAt(API)`). Where a check stands on\n" +
        "something a copy did differently, ask for it there — `noAnswer: 'throw'`, `emptyBodyOn: [...]`,\n" +
        '`dataOrBody: true` — and say why in a comment; a helper that keeps its own call shape can call the one\n' +
        'client (`const api = (token, method, p, body) => apiAs(token)(p, { method, body })`).',
    )
    process.exitCode = 1
    return false
  }
  console.log(`[api-clients] ok — ${suites} suite(s) read, 0 hand-rolled API clients`)
  return true
}

/*
 * THE PLANTED SUITES. Each gets a directory of its own, and the gate — this
 * file, or under `--mutate` a broken copy of it — runs over it as a child,
 * exactly as it runs over `test/e2e`.
 */
const one = (...lines) => ({ 'c.mjs': lines.join('\n') })
const CASES = [
  ['caught', 'name: the copy 172 suites carried', one(
    'const apiAs = (token) => async (route, init = {}) => {',
    '  const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}` } }).catch(() => null)',
    "  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }",
    '  const json = await res.json().catch(() => null)',
    '  return { status: res.status, data: json?.data, error: json?.error }',
    '}',
  ), /✗ c\.mjs:1 {2}NAME {2}const apiAs = \(token\)/],
  ['caught', 'name: apiAs as a function declaration', one(
    'function apiAs(token) {',
    '  return (route) => fetch(`${API}${route}`).then((r) => r.status)',
    '}',
  ), /✗ c\.mjs:1 {2}NAME {2}function apiAs/],
  ['caught', 'name: apiAs assigned a function later', one(
    'let apiAs = null',
    'apiAs = async (token) => ({ token })',
  ), /✗ c\.mjs:2 {2}NAME {2}apiAs = async/],
  ['caught', 'shape: the same factory by another name', one(
    'const client = (token) => async (route, init = {}) => {',
    '  const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}` } })',
    '  return { status: res.status, data: (await res.json().catch(() => null))?.data }',
    '}',
  ), /✗ c\.mjs:2 {2}SHAPE {2}const res = await fetch/],
  ['caught', 'shape: a helper bound to one token', one(
    'let token = null',
    'const call = async (route, init = {}) => {',
    "  const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } })",
    '  return { status: res.status, data: (await res.json().catch(() => null))?.data }',
    '}',
  ), /✗ c\.mjs:3 {2}SHAPE /],
  ['caught', 'shape: api(token, method, path, body), text between the base and the path', one(
    'const api = async (token, method, p, body) => {',
    '  const res = await fetch(`${stack.apiBase}/api/v1${p}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) })',
    '  const parsed = await res.json().catch(() => null)',
    '  return { status: res.status, data: parsed?.data ?? parsed }',
    '}',
  ), /✗ c\.mjs:2 {2}SHAPE /],
  ['caught', 'shape: a function declaration, its URL built with +', one(
    'async function get(route) {',
    '  const r = await fetch(API + route)',
    '  return { status: r.status, data: (await r.json()).data }',
    '}',
  ), /✗ c\.mjs:2 {2}SHAPE /],
  ['caught', 'shape: the URL handed in whole', one(
    'const get = async (url) => {',
    '  const r = await fetch(url, { headers: { authorization: `Bearer ${t}` } })',
    '  return { status: r.status, data: (await r.json()).data }',
    '}',
  ), /✗ c\.mjs:2 {2}SHAPE /],
  ['caught', 'a directory with no suites in it', { 'README.md': 'nothing' }, /below the floor/],
  ['caught', 'a suite that does not lex to a clean end', one('const t = `left open ${WS}'), /could not be read as JavaScript/],
  ['passes', "the fixture's client bound to this lane, and helpers made from it", one(
    "import { apiAs as apiAsAt } from './lib/fixture.mjs'",
    "const apiAs = apiAsAt(API, { noAnswer: 'throw', emptyBodyOn: ['POST'] })",
    'const A = apiAs(token)',
    'const call = apiAs(token)',
    'const api = (token, method, p, body) => apiAs(token)(p, { method, body })',
    "chk((await A('/users/me')).ok, 'the admin is there')",
  )],
  ['passes', "a stub's control route, which hands back r.ok", one(
    "const stub = (route, body) => fetch(`${MODEL}/__control/${route}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.ok).catch(() => false)",
    'const seen = async () => (await fetch(`${MODEL}/__control/seen`).then((r) => r.json()).catch(() => null))?.calls ?? null',
  )],
  ['passes', 'a fixed route with handling of its own', one(
    'const signUp = async (label) => {',
    "  const res = await fetch(`${API}/auth/signup`, { method: 'POST', body: JSON.stringify({ label }) })",
    '  const data = (await res.json().catch(() => null))?.data',
    '  if (!data?.accessToken) throw new Error(`could not sign ${label} up: ${res.status}`)',
    '  return { email: label, token: data.accessToken }',
    '}',
    'const task = async () => {',
    '  const r = await fetch(`${API}/tasks/${TASK_ID}`)',
    '  return { status: r.status, data: (await r.json()).data }',
    '}',
  )],
  ['passes', "a file's bytes: routed, but handing back no data", one(
    'const download = async (method, route, body) => {',
    '  const res = await fetch(`${API}${route}`, { method, body: body ? JSON.stringify(body) : undefined }).catch(() => null)',
    "  if (!res) return { status: 0, type: '', bytes: Buffer.alloc(0) }",
    "  return { status: res.status, type: res.headers.get('content-type') ?? '', bytes: Buffer.from(await res.arrayBuffer()) }",
    '}',
  )],
  ['passes', 'a URL with text after its parameter', one(
    'const read = async (token) => fetch(`${API}/ical/${token}.ics`).then(async (r) => ({ status: r.status, data: await r.text() }))',
  )],
  ['passes', 'the shapes in a comment, a string and a template', one(
    '// const apiAs = (token) => async (route) => { return { data: await fetch(`${API}${route}`) } }',
    '/* function apiAs(token) { return fetch(url) } */',
    'const said = "const call = async (route) => { const r = await fetch(`${API}${route}`); return { data: r } }"',
    'const tpl = `apiAs = (t) => fetch(API + route) ${WS}`',
    "chk(said.length > 0 && tpl.length > 0, 'nothing here calls the API')",
  )],
]

function runCases(gate) {
  let fail = 0
  const seen = {}
  console.log(`\n▶ planted suites, each run through ${gate === SELF ? 'this gate' : 'the gate under test'}`)
  for (const [want, name, files, pattern] of CASES) {
    const dir = mkdtempSync(join(tmpdir(), 'api-clients-'))
    let r
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), `${text}\n`)
      }
      const env = { ...process.env, SUITE_DIR: dir }
      delete env.API_CLIENTS_UNDER_TEST
      r = spawnSync(process.execPath, [gate], { encoding: 'utf8', env, timeout: 60_000 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const ok = want === 'caught' ? r.status === 1 && pattern.test(out) : r.status === 0 && /\[api-clients\] ok/.test(out)
    seen[name] = { ok, first: out.split('\n').find((l) => l.startsWith('✗') || l.startsWith('[api-clients] ok')) ?? '' }
    if (ok) console.log(`  \x1b[32mPASS\x1b[0m ${want === 'caught' ? 'caught' : 'passes'}: ${name}`)
    else {
      fail += 1
      console.log(`  \x1b[31mFAIL\x1b[0m ${want === 'caught' ? 'not caught' : 'did not pass'}: ${name} — exit ${r.status}: ${out.trim().split('\n')[0]}`)
    }
  }
  console.log(`\n${CASES.length - fail} passed, ${fail} failed`)
  return { fail, seen }
}

if (process.env.API_CLIENTS_UNDER_TEST) {
  // One pass of the cases against a broken copy, started by `proveMutationsBite` below.
  process.exitCode = runCases(process.env.API_CLIENTS_UNDER_TEST).fail ? 1 : 0
} else {
  const realOk = report(scan(SUITES))
  if (process.argv.includes('--mutate')) {
    const { fail, seen } = runCases(SELF)
    const copy = seen[CASES[0][1]]
    const bound = seen[CASES.find(([want]) => want === 'passes')[1]]
    console.log(
      `[api-clients] mutate: the planted copy of apiAs was ${copy.ok ? 'caught' : 'NOT caught'} — ${copy.first}\n` +
        `[api-clients] mutate: the fixture's client, bound, ${bound.ok ? 'passes' : 'does NOT pass'} — ${bound.first}`,
    )
    const alive = (mutant) => {
      const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8', timeout: 120_000 })
      return { ok: /\[api-clients\]|✗/.test(r.stdout ?? ''), why: r.stderr }
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
      envVar: 'API_CLIENTS_UNDER_TEST',
      label: 'this gate',
      alive,
      mutations: [
        ['name-rule-off', at('if (fnAt.has(rhs)) sites', ".push({ at: m.index, rule: 'NAME' })"), 'if (false) sites.push({})'],
        ['declarations-pass', at("    sites.push({ at: m.index, rule: 'NAME' ", '})\n  }\n  for'), '  }\n  for'],
        ['bound-calls-refused', at('if (fnAt.has(rhs)) s', 'ites.push('), 'if (true) sites.push('],
        ['shape-rule-off', at('if (by && ', 'handsBackData(f)) {'), 'if (false) {'],
        ['data-not-required', at('const handsBackData = (f) => ', '/[{,]\\s*data\\s*[:,}]/.test(code.slice(f.start, f.end))'), 'const handsBackData = (f) => true'],
        ['params-not-asked', at('return params.includes(inner) ? ', 'inner : null'), 'return inner || null'],
        ['text-after-the-parameter', at('    if (close !== b - 2) ', 'return null'), ''],
        ['whole-urls-pass', at('if (IDENT.test(t)) return params.includes(t) ? t : ', 'null // fetch(url)'), 'if (false) return null'],
        ['plus-passes', at('if (plus) return params.includes(plus[1]) ? ', 'plus[1] : null'), 'if (plus) return null'],
        ['arrow-params-unread', at('      params = paramNames(code, start, ', 'j)'), '      params = []'],
        ['declared-params-unread', at('fns.push({ start: m.index, name: m[1] ?? null, params: ', 'paramNames(code, open, close),'), 'fns.push({ start: m.index, name: m[1] ?? null, params: [],'],
        ['strings-are-code', at("        if (c === quote) prev = c\n        word = ''\n      } else ", 'blank(i)'), "        if (c === quote) prev = c\n        word = ''\n      }"],
        ['comments-are-code', at("      if (c === '\\n') mode = 'code'\n", '      else blank(i)'), "      if (c === '\\n') mode = 'code'"],
        ['unlexed-read-anyway', at('    if (!found.clean) ', '{'), '    if (false) {'],
        ['no-floor', at('const MIN_SUITES = ', 'process.env.SUITE_DIR ? 1 : 100'), 'const MIN_SUITES = 0'],
        ['violations-exit-zero', at('    process.exitCode = 1\n', '    return false'), '    process.exitCode = 0\n    return false'],
      ],
    })
    if (!realOk || fail || blind) process.exitCode = 1
  }
}
