#!/usr/bin/env node
/*
 * A UNIT RUN PASSES WHEN NO TEST FAILED, NOT WHEN IT EXITED 0
 * (`found-12-oct/a-describe-that-throws-passes`).
 *
 * node:test (Node 22) reports a describe whose body throws as `not ok`, runs
 * none of its tests — "# tests 0", "# fail 0" — and exits 0. Measured on
 * 12 October with a describe that built its fixture in its body
 * (`gantt-export.test.ts` as first written, under its break patch): plain
 * `tsx file` and `tsx --test` both exit 0. CI's two unit steps and the
 * preflight's judged a run by its exit code alone, so a test file broken that
 * way was never read again by anything.
 *
 * So this runs the command, passes its output through (or into `--log`), and
 * fails when the command fails or any TAP line says `not ok` — a `# TODO` is
 * TAP's own way of saying a test is not expected to pass yet, and is let be.
 *
 *   node scripts/unit-tests-pass.mjs [--log FILE] -- <command> [args…]
 *   node scripts/unit-tests-pass.mjs --mutate   # the cases, and that each one bites
 */
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** The TAP lines that say a test or a suite failed. */
export function failedLines(text) {
  return text.split('\n').filter((l) => /^\s*not ok\b/.test(l) && !/#\s*TODO\b/i.test(l))
}

/** The run's verdict: what the command exited with, else 1 for a `not ok` it exited 0 over. */
export function verdict(code, text) {
  if (code !== 0) return { code, why: `the run exited ${code}` }
  const bad = failedLines(text)
  if (bad.length) return { code: 1, why: `the run exited 0 over ${bad.length} failure(s) it reported:\n${bad.map((l) => `    ${l.trim()}`).join('\n')}` }
  return { code: 0, why: '' }
}

function run(argv, log) {
  return new Promise((resolve) => {
    const out = log ? createWriteStream(log) : null
    const child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] })
    let text = ''
    const take = (chunk) => {
      text += chunk
      if (out) out.write(chunk)
      else process.stdout.write(chunk)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    child.on('error', (err) => {
      take(`${err.message}\n`)
      resolve({ code: 127, text })
    })
    child.on('close', (code, signal) => {
      const done = () => resolve({ code: code ?? (signal ? 1 : 0), text })
      if (out) out.end(done)
      else done()
    })
  })
}

if (process.argv.includes('--mutate')) {
  // Probe files the way the tree's tests are written, run by node itself: the hole is node:test's.
  const dir = mkdtempSync(join(tmpdir(), 'unit-tests-pass-'))
  let ok = true
  const say = (good, label) => {
    console.log(`[unit-tests-pass] ${label} — ${good ? 'ok' : 'NOT ok'}`)
    if (!good) ok = false
  }
  try {
    const probe = (name, body) => {
      writeFileSync(join(dir, name), `import { describe, it } from 'node:test'\nimport assert from 'node:assert/strict'\n${body}\n`)
      const raw = spawnSync(process.execPath, ['--test', join(dir, name)], { encoding: 'utf8' })
      return { raw: raw.status, text: `${raw.stdout}${raw.stderr}` }
    }
    const pass = probe('pass.test.mjs', "describe('a suite', () => { it('passes', () => assert.equal(1, 1)) })")
    const thrown = probe('thrown.test.mjs', "describe('a suite whose body throws', () => { const a = []; a.length = -1; it('never runs', () => {}) })")
    const failing = probe('failing.test.mjs', "describe('a suite', () => { it('fails', () => assert.equal(1, 2)) })")
    // A todo that fails is reported `not ok … # TODO` and exits 0: TAP's own "not expected to pass yet".
    const todo = probe('todo.test.mjs', "describe('a suite', () => { it.todo('is written later', () => assert.equal(1, 2)) })")
    say(pass.raw === 0 && verdict(pass.raw, pass.text).code === 0, 'a run whose tests pass passes')
    // The defect itself, measured each time: if node ever exits non-zero here, this file's reason is gone.
    say(thrown.raw === 0 && /not ok/.test(thrown.text), 'node exits 0 over a describe whose body threw (the hole, still there)')
    say(verdict(thrown.raw, thrown.text).code === 1, 'and such a run fails here')
    say(verdict(failing.raw, failing.text).code !== 0, 'a run with a failing test fails')
    say(verdict(7, '').code === 7, 'a command that exits non-zero with nothing to read fails with its own code')
    say(todo.raw === 0 && /not ok .*# TODO/.test(todo.text) && verdict(todo.raw, todo.text).code === 0, 'a failing TODO is not a failure')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  process.exitCode = ok ? 0 : 1
} else {
  const args = process.argv.slice(2)
  const sep = args.indexOf('--')
  const logAt = args.indexOf('--log')
  const log = logAt !== -1 && logAt < sep ? args[logAt + 1] : null
  const argv = sep === -1 ? [] : args.slice(sep + 1)
  if (!argv.length) {
    console.error('usage: node scripts/unit-tests-pass.mjs [--log FILE] -- <command> [args…]')
    process.exitCode = 2
  } else {
    const { code, text } = await run(argv, log)
    const v = verdict(code, text)
    if (v.code !== 0) console.error(`[unit-tests-pass] ${v.why}`)
    process.exitCode = v.code
  }
}
