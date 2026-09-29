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
 */
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
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

let ok = check(SUITES, BASELINE)

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
}
process.exitCode = ok ? 0 : 1
