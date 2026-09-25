#!/usr/bin/env node
/*
 * THE WHOLE-SCRIPT GATE, AND THE PREMISE UNDER IT.
 *
 * First the premise, measured rather than assumed: a script is started, and
 * while it sleeps a line is inserted near its top, in place. The plain script
 * reads on from its old offset into shifted text; the one whose body is a
 * brace group ending in `exit` finishes as it was written. If the plain one
 * ever stops misreading, the rule protects against nothing and this says so.
 *
 * Then the gate on planted directories — a wrapped script, one never wrapped,
 * one whose group does not end in `exit`, an exempt library, an empty
 * directory — and `--mutate` breaks the gate one rule at a time.
 *
 *   node scripts/check-lane-scripts-whole-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = process.env.GATE_UNDER_TEST ?? join(HERE, 'check-lane-scripts-whole.mjs')

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

/** Run `body` as a script, edit it in place while it sleeps, and return what it printed. */
const editMidRun = (body) =>
  new Promise((resolve) => {
    const dir = mkdtempSync(join(tmpdir(), 'lane-whole-'))
    const file = join(dir, 'run.sh')
    writeFileSync(file, body)
    const child = spawn('bash', [file], { encoding: 'utf8' })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    setTimeout(() => {
      // In place: the same file, one line longer before the point the run has reached.
      const text = readFileSync(file, 'utf8')
      writeFileSync(file, text.replace('#!/bin/bash\n', '#!/bin/bash\n# a line added while it ran, to shift every offset after it\n'))
    }, 400)
    child.on('close', (code) => { rmSync(dir, { recursive: true, force: true }); resolve({ code, out }) })
  })

const PLAIN = '#!/bin/bash\necho first\nsleep 1\necho second\necho third\n'
const WHOLE = '#!/bin/bash\n{\necho first\nsleep 1\necho second\necho third\nexit\n}\n'

console.log('\n▶ the premise: a line inserted in place while the script runs')
{
  const plain = await editMidRun(PLAIN)
  const whole = await editMidRun(WHOLE)
  const clean = (r) => r.code === 0 && r.out === 'first\nsecond\nthird\n'
  chk(
    !clean(plain) && clean(whole),
    'an edit mid-run shifts what a plain script reads next, and a script read whole finishes as written',
    `plain ${JSON.stringify(plain)}; whole ${JSON.stringify(whole)}`,
  )
}

/** Plant scripts ({ name: text }) in a throwaway directory and run the gate there. */
const plant = (scripts, { noDir = false } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'lane-whole-gate-'))
  const dir = join(root, 'e2e-lanes')
  try {
    if (!noDir) mkdirSync(dir)
    for (const [name, text] of Object.entries(scripts)) writeFileSync(join(dir, name), text)
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', env: { ...process.env, LANE_SCRIPTS_DIR: dir } })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const HEADER = '#!/bin/bash\n# What it does.\n'

console.log('\n▶ the gate')
{
  const r = plant({ 'sweep.sh': `${HEADER}{\nset -u\necho run\nexit\n}\n`, 'lane-env.sh': `${HEADER}lane_env () { :; }\n` })
  chk(r.code === 0 && /2 lane script\(s\) read/.test(r.out), 'a wrapped script, and an exempt library beside it, pass — and both are read', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ 'sweep.sh': `${HEADER}set -u\necho run\n` })
  chk(r.code === 1 && /sweep\.sh: its body does not open a brace group/.test(r.out), 'a script never wrapped is a failure, named', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ 'sweep.sh': `${HEADER}{\nset -u\necho run\n}\n` })
  chk(r.code === 1 && /does not end in `exit`/.test(r.out), 'a group that does not end in exit is a failure', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({ 'sweep.sh': `${HEADER}{\nset -u\nexit\n}\necho after\n` })
  chk(r.code === 1 && /does not close the file/.test(r.out), 'code after the group is a failure', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({})
  chk(r.code === 1 && /nothing was read/.test(r.out), 'a directory with no scripts is a failure, not a pass', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant({}, { noDir: true })
  chk(r.code === 1 && /nothing was read/.test(r.out), 'no directory at all is a failure', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.GATE_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8' })
    return { ok: /ok\b/.test(r.stdout ?? ''), why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: GATE,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'GATE_UNDER_TEST',
    label: 'the gate',
    alive,
    mutations: [
      ['misses-pass', 'process.exitCode = 1', 'process.exitCode = 0'],
      ['open-unchecked', "if (first?.trim() !== '{')", 'if (false)'],
      ['exit-unchecked', "else if (beforeLast?.trim() !== 'exit')", 'else if (false)'],
      ['close-unchecked', "else if (last?.trim() !== '}')", 'else if (false)'],
      ['all-exempt', '    if (EXEMPT.has(name)) continue', '    continue'],
      ['empty-passes', 'if (read === 0) problems.push', 'if (false) problems.push'],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
