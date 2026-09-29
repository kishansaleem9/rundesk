#!/usr/bin/env node
/**
 * A self-test for `scripts/lib/run-mutant.mjs`: a mutant run ends with
 * everything it started, and what it named after its pid is gone.
 *
 * Every gate that re-runs itself against a mutant goes through it. Before it,
 * spawnSync's timeout signalled the mutant alone. The stub gates' mutants had
 * started a stub and a probe, and the next `git add -A` staged eleven probe
 * files from runs ended that way (`found-29-sep/killed-mutants-outlive-their-run`).
 *
 * Each case runs a child that starts a grandchild the way a gate's mutant
 * starts its stub, and writes a file named after its own pid the way the probe
 * is named. The cases then ask whether the grandchild is still running and the
 * file still there.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.RUN_MUTANT_LIB ?? join(HERE, 'lib/run-mutant.mjs')
const { runMutant } = await import(SUBJECT)

const DIR = mkdtempSync(join(tmpdir(), 'run-mutant-'))
let failed = 0
const check = (ok, what, why) => {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `\n        ${why}`}`)
}

/*
 * A process that has been killed but not yet reaped is a zombie, and a
 * container's pid 1 may never reap it: signal 0 still finds it. So running
 * means present and not in state Z.
 */
const running = (pid) => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2)[0] !== 'Z'
  } catch {
    return false
  }
}
const stillRunning = []
const settled = (pid) => {
  for (let i = 0; i < 20 && running(pid); i++) spawnSync('sleep', ['0.05'])
  const up = running(pid)
  if (up) stillRunning.push(pid)
  return up
}

// The child: start a grandchild that never ends, record its pid, write the
// file named after its own pid, then either wait forever or exit at once, as a
// mutant that throws before it stops its stub does.
const child = (waits) => `
  const { spawn } = require('node:child_process')
  const { writeFileSync } = require('node:fs')
  const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  writeFileSync(${JSON.stringify(DIR)} + '/grandchild-' + process.pid, String(g.pid))
  writeFileSync(${JSON.stringify(DIR)} + '/left-' + process.pid + '.ts', 'probe')
  console.log('started')
  ${waits ? 'setInterval(() => {}, 1000)' : 'process.exit(3)'}
`
const leftBehind = (pid) => [join(DIR, `left-${pid}.ts`)]
const grandchildOf = (pid) => Number(readFileSync(join(DIR, `grandchild-${pid}`), 'utf8'))

console.log('▶ a run its timeout ends')
const ended = runMutant(['-e', child(true)], { timeout: 1500, leftBehind })
check(ended.signal === 'SIGTERM' || ended.error?.code === 'ETIMEDOUT', 'is ended by its timeout', `it ended ${ended.status} / ${ended.signal}`)
check(!settled(grandchildOf(ended.pid)), 'and what it started is not still running', `grandchild ${grandchildOf(ended.pid)} is still running`)
check(!existsSync(join(DIR, `left-${ended.pid}.ts`)), 'and the file it named after its pid is gone', `left-${ended.pid}.ts is still there`)

console.log('▶ a run that ends by itself without stopping what it started')
const own = runMutant(['-e', child(false)], { timeout: 30_000, leftBehind })
check(own.status === 3 && /started/.test(own.stdout), 'answers with its own status and output', `it answered ${own.status}, ${JSON.stringify(own.stdout)}`)
check(!settled(grandchildOf(own.pid)), 'and what it started is not still running', `grandchild ${grandchildOf(own.pid)} is still running`)
check(!existsSync(join(DIR, `left-${own.pid}.ts`)), 'and the file it named after its pid is gone', `left-${own.pid}.ts is still there`)

// What a mutant of the helper left running is ended here, so --mutate leaks nothing.
for (const pid of stillRunning) {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {}
}
rmSync(DIR, { recursive: true, force: true })

console.log(`\n${failed === 0 ? 'ok' : 'not ok'} run-mutant: ${failed} case(s) failed`)
if (failed) process.exitCode = 1

if (process.argv.includes('--mutate') && !process.env.RUN_MUTANT_LIB) {
  const blind = proveMutationsBite({
    subject: join(HERE, 'lib/run-mutant.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'RUN_MUTANT_LIB',
    label: 'the mutant runner',
    alive: (mutant) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(mutant)})`], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      return { ok: r.status === 0, why: (r.stderr ?? '').trim() }
    },
    mutations: [
      ['the child shares the gate’s process group', ', detached: true })', ' })'],
      ['the group is never ended', "process.kill(-r.pid, 'SIGKILL')", 'void r.pid'],
      ['only the child is ended, not its group', "process.kill(-r.pid, 'SIGKILL')", "process.kill(r.pid, 'SIGKILL')"],
      ['the group is ended only when the timeout fired', 'if (r.pid) {', 'if (r.pid && r.signal) {'],
      ['what the child named after its pid stays', 'for (const file of leftBehind(r.pid)) rmSync(file, { force: true })', 'void leftBehind'],
    ],
  })
  if (blind) process.exitCode = 1
}
