#!/usr/bin/env node
/*
 * NO NEW `process.exit()` IN A SUITE — A RATCHET (`commit-log/log-30183c3-1`).
 *
 * `process.exit()` stops Node without draining stdout, and a write to a PIPE is
 * asynchronous: whatever has not reached the reader is lost, and what survives
 * is the START, so a cut-off run looks like one that stopped early
 * (`scripts/lib/bail.mjs` measured it: 129,904 of 195,296 bytes lost to a slow
 * reader). The break runner and the lanes write a suite's output to a FILE,
 * where a write is synchronous, so there it is harmless; CI's steps print to
 * the runner's pipe, which is the slow reader.
 *
 * Converting all of them at once is not free: a suite that ends in
 * `process.exit()` may be relying on it to stop a handle nothing closed, and
 * `process.exitCode` would leave that run hanging until CI's timeout. So the
 * count may only fall. Measured on 29 September, comments and strings left out:
 * 215 calls in 113 suites, and 129 suites already set `process.exitCode`.
 *
 *   node scripts/check-suite-process-exit.mjs [--mutate]
 *
 * More than the baseline fails, naming the suites. Fewer fails too, asking for
 * the baseline to come down with it, so a conversion cannot be undone quietly.
 *
 * AND A SUITE THAT STARTS THE LOCAL STACK CLOSES IT, BY A MEMBER IT HAS
 * (`found-12-oct/suites-stop-a-stack-with-no-stop`). The stack's server is the
 * handle every browser suite opens, and `process.exitCode` ends a run only once
 * it is closed. Twice a teardown called `stack.stop?.()` — `doc-import` on 23
 * September, `task-email-accounts` on 12 October — and the stack has no `stop`:
 * an optional call on nothing, so the checks printed and the run sat until
 * `timeout` killed it. So every member a suite reads off its stack must be one
 * `startLocalStack` returns (read from its own `return`, not listed here), and a
 * suite that starts one closes it, unless it ends in `process.exit()`.
 */
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const BASELINE = 215
const SUITES = process.env.SUITE_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'e2e')
const MIN_SUITES = process.env.SUITE_DIR ? 1 : 100

/*
 * THE SUITE AS CODE: comments, strings, regex literals and template text
 * blanked, so `process.exit(` in a sentence or a comment is not a call. The
 * lexer is `check-suite-text-reads.mjs`'s, copied rather than imported (that
 * file runs when imported, and its own mutations anchor inside its lexer).
 */
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'await', 'yield'])
function lex(src) {
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
export const code = (src) => lex(src).code

export function count(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
  const bySuite = []
  let total = 0
  for (const f of files) {
    const n = (code(readFileSync(join(dir, f), 'utf8')).match(/\bprocess\.exit\s*\(/g) ?? []).length
    if (n) bySuite.push([f, n])
    total += n
  }
  return { suites: files.length, total, bySuite }
}

function check(dir, baseline, min = MIN_SUITES) {
  const { suites, total, bySuite } = count(dir)
  if (suites < min) {
    console.error(`[process-exit] read ${suites} suite(s) in ${dir} — fewer than ${min}, so this says nothing`)
    return false
  }
  if (total > baseline) {
    console.error(`[process-exit] ${total} process.exit() call(s) in the suites, more than the ${baseline} allowed. Set process.exitCode instead, and close what keeps the run alive:`)
    for (const [f, n] of bySuite) console.error(`    ${f}  ${n}`)
    return false
  }
  if (total < baseline) {
    console.error(`[process-exit] ${total} process.exit() call(s), fewer than the baseline ${baseline} — lower BASELINE in this file to ${total}, so the conversion stays.`)
    return false
  }
  console.log(`[process-exit] ok — ${total} process.exit() call(s) in ${bySuite.length} of ${suites} suite(s), none added`)
  return true
}

/** From an opening bracket to the one that closes it, in code already lexed. */
function shut(s, at) {
  for (let i = at, depth = 0; i < s.length; i++) {
    if ('([{'.includes(s[i])) depth += 1
    else if (')]}'.includes(s[i]) && --depth === 0) return i
  }
  return -1
}

/** What `startLocalStack` hands back: the keys of the last object its body returns. */
export function stackMembers(dir) {
  let src
  try {
    src = code(readFileSync(join(dir, 'lib', 'local-stack.mjs'), 'utf8'))
  } catch {
    return null
  }
  const fn = /\bfunction\s+startLocalStack\s*\(/.exec(src)
  if (!fn) return null
  // Past the parameters — a destructured `{ … }` among them — to the body.
  const params = shut(src, fn.index + fn[0].length - 1)
  const open = params < 0 ? -1 : src.indexOf('{', params)
  const end = open < 0 ? -1 : shut(src, open)
  if (end < 0) return null
  const body = src.slice(open, end + 1)
  const ret = [...body.matchAll(/\breturn\s*\{/g)].pop()
  if (!ret) return null
  const at = ret.index + ret[0].length - 1
  const close = shut(body, at)
  if (close < 0) return null
  const members = new Set()
  let depth = 0
  let part = ''
  for (const c of `${body.slice(at + 1, close)},`) {
    if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) depth -= 1
    if (c === ',' && depth === 0) {
      const key = /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)/.exec(part)?.[1]
      if (key) members.add(key)
      part = ''
    } else part += c
  }
  return members
}

/** Each suite's local stack: what it reads off it that the stack has not, and whether it is closed. */
export function stackUses(dir, members) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
  const strange = []
  const unclosed = []
  const unnamed = []
  let started = 0
  for (const f of files) {
    const src = code(readFileSync(join(dir, f), 'utf8'))
    if (!/\bstartLocalStack\s*\(/.test(src)) continue
    const names = new Set([...src.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*await\s+startLocalStack\s*\(/g)].map((m) => m[1]))
    if (names.size === 0) {
      unnamed.push(f)
      continue
    }
    started += 1
    for (const n of names) {
      const read = new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, 'g')
      const used = new Set([...src.matchAll(read)].map((m) => m[1]))
      for (const m of used) if (!members.has(m)) strange.push(`${f}: ${n}.${m}`)
      if (!used.has('close') && !/\bprocess\.exit\s*\(/.test(src)) unclosed.push(`${f}: ${n}`)
    }
  }
  return { started, strange, unclosed, unnamed }
}

// Every directory `checkStacks` read, and how many of its suites start a stack: `--mutate` asks that the tree's own was.
const stacksRead = []

function checkStacks(dir, min = MIN_SUITES) {
  const members = stackMembers(dir)
  if (!members?.has('close')) {
    console.error(`[process-exit] could not read what startLocalStack returns in ${join(dir, 'lib', 'local-stack.mjs')}, or it has no \`close\` — this says nothing about how a suite ends`)
    return false
  }
  const { started, strange, unclosed, unnamed } = stackUses(dir, members)
  stacksRead.push([dir, started])
  if (started < min) {
    console.error(`[process-exit] ${started} suite(s) start the local stack — fewer than ${min}, so this says nothing`)
    return false
  }
  const has = [...members].join(', ')
  if (strange.length) {
    console.error(`[process-exit] a suite reads a member its local stack does not have (it has ${has}) — an optional call on one closes nothing, and the run hangs after its checks:`)
    for (const s of strange) console.error(`    ${s}`)
  }
  if (unclosed.length) {
    console.error('[process-exit] a suite starts the local stack and never closes it, nor ends in process.exit() — the run hangs after its checks:')
    for (const s of unclosed) console.error(`    ${s}`)
  }
  if (unnamed.length) {
    console.error('[process-exit] a suite starts the local stack without naming it, so its close cannot be read — `const stack = await startLocalStack(…)`:')
    for (const s of unnamed) console.error(`    ${s}`)
  }
  if (strange.length || unclosed.length || unnamed.length) return false
  console.log(`[process-exit] ok — ${started} suite(s) start the local stack and close it (or end in process.exit()), reading only ${has}`)
  return true
}

let ok = check(SUITES, BASELINE)
ok = checkStacks(SUITES) && ok

if (ok && process.argv.includes('--mutate')) {
  const dir = mkdtempSync(join(tmpdir(), 'process-exit-'))
  try {
    writeFileSync(join(dir, 'a.mjs'), "process.exitCode = 1\n// process.exit(1) in a comment\nconst s = 'process.exit(1) in a string'\n")
    const quiet = count(dir).total === 0
    writeFileSync(join(dir, 'b.mjs'), 'if (bad) process.exit(1)\n')
    const caught = count(dir).total === 1
    const over = !(() => { const saved = console.error; console.error = () => {}; try { return check(dir, 0, 1) } finally { console.error = saved } })()
    console.log(`[process-exit] mutate: a call in a comment or a string is not counted — ${quiet ? 'ok' : 'NOT ok'}`)
    console.log(`[process-exit] mutate: a planted call is counted and one over the baseline fails — ${caught && over ? 'ok' : 'NOT ok'}`)
    if (!quiet || !caught || !over) ok = false
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  const sdir = mkdtempSync(join(tmpdir(), 'process-exit-stack-'))
  // A check run with its words kept, not printed: `ok` and what it `said`.
  const heard = (fn) => {
    const saved = [console.log, console.error]
    const said = []
    console.log = console.error = (...words) => said.push(words.join(' '))
    try {
      return { ok: fn(), said: said.join('\n') }
    } finally {
      ;[console.log, console.error] = saved
    }
  }
  try {
    mkdirSync(join(sdir, 'lib'))
    // A destructured parameter, braces in the body and a nested `return { stop }`
    // before the last one: the members are the last object the body returns.
    const lib = (ret) =>
      writeFileSync(
        join(sdir, 'lib', 'local-stack.mjs'),
        `export async function startLocalStack({ dist, port: bind = 0 }) {\n  const server = make({ dist })\n  const spare = () => { return { stop: 1 } }\n  return ${ret}\n}\n`,
      )
    lib('{ server, base: `http://127.0.0.1:${bind}`, close: () => server.close() }')
    // No suite here starts one yet: a directory read wrong says nothing, and fails.
    const emptyFails = !heard(() => checkStacks(sdir, 1)).ok
    writeFileSync(
      join(sdir, 'c.mjs'),
      "import { startLocalStack } from './lib/local-stack.mjs'\nconst stack = await startLocalStack({})\n// stack.stop?.() in a comment\nconst said = 'stack.stop()'\ntry { await go(stack.base) } finally { stack?.close?.() }\nprocess.exitCode = 0\n",
    )
    writeFileSync(join(sdir, 'd.mjs'), 'const s = await startLocalStack({})\nawait go(s.base)\nprocess.exit(0)\n')
    const passes = heard(() => checkStacks(sdir, 1)).ok
    writeFileSync(join(sdir, 'e.mjs'), 'const stack = await startLocalStack({})\ntry {} finally { await stack.stop?.().catch?.(() => {}) }\nprocess.exitCode = 0\n')
    const e = stackUses(sdir, stackMembers(sdir))
    const stopCaught = e.strange.join() === 'e.mjs: stack.stop' && e.unclosed.join() === 'e.mjs: stack' && !heard(() => checkStacks(sdir, 1)).ok
    rmSync(join(sdir, 'e.mjs'))
    // Closed as well, a stranger still fails: the run reads something the stack never gave it.
    writeFileSync(join(sdir, 'h.mjs'), 'const stack = await startLocalStack({})\nawait stack.ready\nstack.close()\n')
    const h = heard(() => checkStacks(sdir, 1))
    const strangerFails = !h.ok && h.said.includes('h.mjs: stack.ready') && !h.said.includes('never closes')
    rmSync(join(sdir, 'h.mjs'))
    writeFileSync(join(sdir, 'f.mjs'), 'let stack\nstack = await startLocalStack({})\nconsole.log(stack.base)\n')
    const f = stackUses(sdir, stackMembers(sdir))
    const neverCaught = f.strange.length === 0 && f.unclosed.join() === 'f.mjs: stack' && !heard(() => checkStacks(sdir, 1)).ok
    rmSync(join(sdir, 'f.mjs'))
    writeFileSync(join(sdir, 'g.mjs'), 'const { base, close } = await startLocalStack({})\nclose()\n')
    const unnamedCaught = stackUses(sdir, stackMembers(sdir)).unnamed.join() === 'g.mjs' && !heard(() => checkStacks(sdir, 1)).ok
    rmSync(join(sdir, 'g.mjs'))
    lib('{ server, stop: () => server.close() }')
    const noClose = heard(() => checkStacks(sdir, 1))
    const fromLib =
      stackUses(sdir, stackMembers(sdir)).strange.join() === 'c.mjs: stack.base,c.mjs: stack.close,d.mjs: s.base' &&
      !noClose.ok && noClose.said.includes('has no `close`')
    console.log(`[process-exit] mutate: where no suite starts a stack, the rule says nothing and fails — ${emptyFails ? 'ok' : 'NOT ok'}`)
    console.log(`[process-exit] mutate: a stack closed by its close, or a suite ended by process.exit(), passes; a stop in a comment or a string is no call — ${passes ? 'ok' : 'NOT ok'}`)
    console.log(`[process-exit] mutate: a teardown calling stack.stop?.() is caught, as a member the stack has not and as a stack never closed — ${stopCaught ? 'ok' : 'NOT ok'}`)
    console.log(`[process-exit] mutate: a member the stack has not, read beside its close, fails on its own — ${strangerFails ? 'ok' : 'NOT ok'}`)
    console.log(`[process-exit] mutate: a stack started and never closed is caught — ${neverCaught ? 'ok' : 'NOT ok'}`)
    console.log(`[process-exit] mutate: a stack started without a name is caught — ${unnamedCaught ? 'ok' : 'NOT ok'}`)
    console.log(`[process-exit] mutate: the members are the library's own — returning stop and no close, close is the stranger and the rule says so — ${fromLib ? 'ok' : 'NOT ok'}`)
    const treeRead = stacksRead.some(([d, n]) => d === SUITES && n >= MIN_SUITES)
    console.log(`[process-exit] mutate: the tree's own suites were read for their stacks — ${treeRead ? 'ok' : 'NOT ok'}`)
    if (!emptyFails || !passes || !stopCaught || !strangerFails || !neverCaught || !unnamedCaught || !fromLib || !treeRead) ok = false
  } finally {
    rmSync(sdir, { recursive: true, force: true })
  }
}
process.exitCode = ok ? 0 : 1
