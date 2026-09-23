#!/usr/bin/env node
/*
 * `bail()` STOPS THE FILE, DELIVERS EVERY BYTE, AND EXITS WITH ITS CODE — held
 * to all three in a child process, because the difference only shows when
 * stdout is a pipe:
 *
 *   piped      200KB queued, then `await bail(3)` mid-file: exit 3, all 200KB
 *              arrive, and the line after the call never runs
 *   to a file  the same, redirected: exit 3, the line after never runs
 *   idle       nothing queued: exit 3 at once
 *
 * The line-after case is the defect this was written for: `bail()` returned
 * whenever output was queued, and eleven checkers kept running past their own
 * refusal whenever they were piped — which CI always is.
 *
 * `--mutate` runs the cases against broken copies of `lib/bail.mjs` and
 * requires every one to be caught.
 *
 *   node scripts/check-bail.mjs [--mutate]
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = join(HERE, 'lib/bail.mjs')
const TMP = mkdtempSync(join(tmpdir(), 'check-bail-'))
const BIG = 200_000

/** A child that queues `bytes` of output, bails with 3, then says it ran on. */
function childScript(lib, bytes) {
  const file = join(TMP, `child-${bytes}.mjs`)
  writeFileSync(
    file,
    `import { bail } from ${JSON.stringify(lib)}\n` +
      (bytes ? `process.stdout.write('x'.repeat(${bytes}) + '\\n')\n` : '') +
      `await bail(3)\n` +
      `console.log('RAN ON PAST BAIL')\n`,
  )
  return file
}

function cases(lib) {
  const bad = []
  const piped = spawnSync('bash', ['-c', `node ${childScript(lib, BIG)} | (sleep 1; cat)`], {
    encoding: 'utf8',
    maxBuffer: 10_000_000,
  })
  const pipedStatus = Number(spawnSync('bash', ['-c', `node ${childScript(lib, BIG)} | (sleep 1; cat > /dev/null); echo \${PIPESTATUS[0]}`], { encoding: 'utf8' }).stdout.trim())
  const xs = (piped.stdout.match(/x/g) ?? []).length
  if (pipedStatus !== 3) bad.push(`piped: exited ${pipedStatus}, want 3`)
  if (xs !== BIG) bad.push(`piped: ${xs} of ${BIG} queued bytes arrived`)
  if (piped.stdout.includes('RAN ON PAST BAIL')) bad.push('piped: the file ran on past `await bail(3)`')

  const out = join(TMP, 'out.txt')
  const toFile = spawnSync('bash', ['-c', `node ${childScript(lib, BIG)} > ${out}`], { encoding: 'utf8' })
  const written = readFileSync(out, 'utf8')
  if (toFile.status !== 3) bad.push(`to a file: exited ${toFile.status}, want 3`)
  if (written.includes('RAN ON PAST BAIL')) bad.push('to a file: the file ran on past `await bail(3)`')

  const idle = spawnSync('node', [childScript(lib, 0)], { encoding: 'utf8' })
  if (idle.status !== 3) bad.push(`idle: exited ${idle.status}, want 3`)
  if (idle.stdout.includes('RAN ON PAST BAIL')) bad.push('idle: the file ran on past `await bail(3)`')
  return bad
}

let failed = false
const real = cases(LIB)
if (real.length) {
  failed = true
  console.log('not ok bail:')
  for (const b of real) console.log(`  ${b}`)
} else {
  console.log('ok bail: piped, redirected and idle — it stops the file, delivers every byte, exits 3')
}

if (process.argv.includes('--mutate')) {
  const source = readFileSync(LIB, 'utf8')
  const MUTANTS = [
    // The old bail: it returned, and the caller ran on.
    ['it returns instead of parking the caller', 'return new Promise(() => {})', 'return undefined'],
    // Exit without draining: the piped tail is lost.
    ['it exits without waiting for the output', 'if (!pending.length) process.exit(code)', 'process.exit(code)'],
    // The code forgotten on the drained path.
    ['the drained exit forgets the code', 'if (--left <= 0) process.exit(code)', 'if (--left <= 0) process.exit(0)'],
  ]
  let caught = 0
  for (const [what, from, to] of MUTANTS) {
    if (!source.includes(from)) {
      console.log(`  mutation CHANGED NOTHING — "${from}" is not in lib/bail.mjs`)
      continue
    }
    const mutant = join(HERE, 'lib/.bail-mutant.mjs')
    writeFileSync(mutant, source.replace(from, to))
    try {
      if (cases(mutant).length) caught += 1
      else console.log(`  mutation SURVIVED: ${what}`)
    } finally {
      rmSync(mutant, { force: true })
    }
  }
  if (caught === MUTANTS.length) console.log(`ok ${caught} of ${MUTANTS.length} mutations of bail are caught`)
  else {
    failed = true
    console.log(`not ok only ${caught} of ${MUTANTS.length} mutations are caught`)
  }
}

rmSync(TMP, { recursive: true, force: true })
process.exitCode = failed ? 1 : 0
