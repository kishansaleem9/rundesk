#!/usr/bin/env node
/*
 * A SUITE THAT ROUTES REQUESTS BLOCKS THE SERVICE WORKER ON EVERY CONTEXT IT
 * OPENS (`found-23-sep/routes-bypassed-by-the-service-worker`).
 *
 * Playwright's `page.route` / `context.route` never sees a request the service
 * worker answers, and the app's worker intercepts every API GET. So a suite
 * that holds, fails or stands in for a request by route can be looking at an
 * answer that already arrived: `webhook-access`'s predicate was never called,
 * and both of its loading checks read a list that had answered. Whether such a
 * route fires depends on whether the worker has claimed the page yet.
 *
 * This reads every suite under `test/e2e/` (and its `lib/`) that calls
 * `.route(`, and fails on each `newContext(…)` or `browser.newPage(…)` in it
 * whose options do not SAY what happens to the worker: `serviceWorkers:
 * 'block'`, or `'allow'` where the worker is what is being tested
 * (`stale-chunk-recovery` keeps it on purpose) or the context routes nothing.
 * Playwright's default is to allow, silently, and silence is what this gate
 * refuses. Options passed as a variable are followed to that variable's
 * object in the same file.
 * `check-suite-routes-cases.mjs` plants suites to fool it.
 *
 *   node scripts/check-suite-routes.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.SUITE_ROUTES_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const DIRS = [join(ROOT, 'test', 'e2e'), join(ROOT, 'test', 'e2e', 'lib')]

/** Comments out, strings kept: a `.route(` in a comment routes nothing. */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

/** The text between the parenthesis at `open` and the one that closes it. */
const argsAt = (s, open) => {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth += 1
    else if (s[i] === ')' && --depth === 0) return s.slice(open + 1, i)
  }
  return s.slice(open + 1)
}
const BLOCKS = /serviceWorkers\s*:\s*['"](block|allow)['"]/

const files = DIRS.flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.mjs')).map((f) => join(d, f)) : []))
const problems = []
let routing = 0
let opened = 0
for (const file of files) {
  const code = stripComments(readFileSync(file, 'utf8'))
  if (!/\.route\(/.test(code)) continue
  routing += 1
  for (const m of code.matchAll(/\b(?:newContext|browser\.newPage)\(/g)) {
    opened += 1
    const args = argsAt(code, m.index + m[0].length - 1).trim()
    let ok = BLOCKS.test(args)
    // Options held in a variable: follow it to its object in this file.
    if (!ok && /^[A-Za-z_$][\w$]*$/.test(args)) {
      const decl = code.match(new RegExp(`\\b(?:const|let|var)\\s+${args}\\s*=\\s*\\{`))
      if (decl) ok = BLOCKS.test(argsAt(code.replace(/\{/g, '(').replace(/\}/g, ')'), decl.index + decl[0].length - 1))
    }
    if (!ok) {
      const line = code.slice(0, m.index).split('\n').length
      problems.push(`${relative(ROOT, file)}:${line} opens a context that does not say serviceWorkers ('block', or 'allow' where the worker is meant), and the file routes requests`)
    }
  }
}
if (files.length === 0) problems.push('no suite was read under test/e2e: nothing was checked')
else if (routing === 0) problems.push('no suite routes a request: nothing was checked, which is not the tree this gate was written for')

if (problems.length) {
  console.log('✗ suites that route requests past a service worker:')
  for (const p of problems) console.log(`  - ${p}`)
  process.exitCode = 1
} else {
  console.log(`ok — ${routing} suite(s) route requests; each of their ${opened} context(s) says what the service worker does`)
}
