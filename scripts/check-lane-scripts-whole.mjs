#!/usr/bin/env node
/*
 * EVERY LANE SCRIPT IS READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
 *
 * Bash reads a script as it runs, by offset. `wt-break.sh` was edited in place
 * — one line added — while the break chain ran, and the two sets that had
 * started around the edit read shifted lines and died at "syntax error near
 * unexpected token", before any patch. So each script the lanes EXECUTE keeps
 * its body in one brace group that ends in `exit`: bash parses the group
 * whole before running any of it, and nothing after it is ever read.
 *
 * Exempt, by name and for a reason each: `lane-env.sh` and `rounds.sh` are
 * libraries, sourced and never run; `batch.sh` is one `exec` line, which is
 * read in one go.
 *
 * A gate that reads nothing answers "ok", so a directory with no scripts is a
 * failure. `check-lane-scripts-whole-cases.mjs` plants scripts to fool it, and
 * shows the premise: an edit mid-run breaks an unwrapped script and not a
 * wrapped one.
 *
 *   node scripts/check-lane-scripts-whole.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = process.env.LANE_SCRIPTS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'e2e-lanes')
const EXEMPT = new Set(['lane-env.sh', 'rounds.sh', 'batch.sh'])

/** The script's lines that are code: not blank, not a comment. */
const codeLines = (text) => text.split('\n').filter((l) => l.trim() !== '' && !l.trimStart().startsWith('#'))

const problems = []
let read = 0
if (!existsSync(DIR)) {
  problems.push(`no lane script directory at ${DIR}: nothing was read`)
} else {
  for (const name of readdirSync(DIR).filter((n) => n.endsWith('.sh')).sort()) {
    read += 1
    if (EXEMPT.has(name)) continue
    const code = codeLines(readFileSync(join(DIR, name), 'utf8'))
    const [first] = code
    const last = code[code.length - 1]
    const beforeLast = code[code.length - 2]
    if (first?.trim() !== '{') problems.push(`${name}: its body does not open a brace group — the first line of code is ${JSON.stringify(first ?? '')}`)
    else if (last?.trim() !== '}') problems.push(`${name}: its brace group does not close the file — the last line of code is ${JSON.stringify(last ?? '')}`)
    else if (beforeLast?.trim() !== 'exit') problems.push(`${name}: its brace group does not end in \`exit\`, so what follows it would still be read`)
  }
  if (read === 0) problems.push(`no .sh script in ${DIR}: nothing was read`)
}

if (problems.length > 0) {
  for (const p of problems) console.log(`\x1b[31m✗\x1b[0m ${p}`)
  process.exitCode = 1
} else {
  console.log(`\x1b[32mok\x1b[0m ${read} lane script(s) read, each run one whole (${[...EXEMPT].join(', ')} exempt)`)
}
