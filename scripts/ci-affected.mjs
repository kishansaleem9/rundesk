#!/usr/bin/env node
/*
 * WHAT A PUSH RUNS — the `changes` job's answer, and the local rehearsal's,
 * from one file so the two cannot disagree (`scripts/lib/ci-affected.mjs`
 * says how the suites are chosen).
 *
 *   node scripts/ci-affected.mjs --base <sha> --head <sha>
 *        [--event <name> --action <name>] [--github-output <file>] [--json]
 *
 * Prints why each suite runs; `--json` prints the answer instead, and
 * `--github-output` appends it as the job's outputs:
 *
 *   code          anything but prose changed (false: the heavy jobs skip, as before)
 *   full          everything runs
 *   suites        `|a|b|`, the Postgres-harness suites to run when not full
 *   web           the browser-suites job runs
 *   harness       the Postgres-harness job runs (full, a suite, or the sweep's mutations)
 *   sweep_mutate  the made-sweep's mutation run is wanted (its own code changed)
 *   trusted       a passing local rehearsal of this very code covers the run
 *
 * TRUSTED, at the owner's word (2 November): "we rehearse everything locally
 * and only push the code, so CI is green without rehearsing it all again".
 * `scripts/ci-rehearsal/affected.sh` and `all.sh` write
 * `docs/rehearsals/latest.json` when every step they ran passed. It is trusted
 * when the commit it names is in this push's history, nothing but prose
 * changed after it, and it ran at least what this push needs (all of Verify;
 * everything, or every suite this push selects, the browser suites if they
 * are wanted, and the sweep's mutations if they are). Then CI runs Verify's
 * quick half itself — lint, types, unit tests — and the heavy jobs not at all.
 * A record is a file anyone who can push can write: CI cannot prove it was not
 * edited, only that it names this code. That is the trade the owner chose.
 *
 * FAILS OPEN: an event without an incremental range, a commit the checkout
 * lacks, a record that does not parse, or any error at all answers "run
 * everything, trust nothing" — never a narrower run.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { affected, classOf } from './lib/ci-affected.mjs'
import { registeredSuites } from './lib/suite-registration.mjs'

const ROOT = process.env.CI_AFFECTED_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
export const RECORD = 'docs/rehearsals/latest.json'

const argOf = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const isCommit = (sha) => {
  if (!sha || /^0+$/.test(sha)) return false
  try {
    git('cat-file', '-e', `${sha}^{commit}`)
    return true
  } catch {
    return false
  }
}

/** The suites each job registers, read from its own stretch of ci.yml. */
export function jobSuites(ciText) {
  const lines = ciText.split('\n')
  const jobAt = (name) => lines.findIndex((l) => l === `  ${name}:`)
  const slice = (name) => {
    const from = jobAt(name)
    if (from === -1) return ''
    let to = lines.length
    for (let i = from + 1; i < lines.length; i += 1) {
      if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
        to = i
        break
      }
    }
    return lines.slice(from, to).join('\n')
  }
  return { harness: [...registeredSuites(slice('postgres-harnesses'))], browser: [...registeredSuites(slice('browser-suites'))] }
}

const EVERYTHING = (why) => ({ code: true, full: true, suites: [], web: true, harness: true, sweepMutate: false, reasons: [`everything: ${why}`] })

/** Is a rehearsal record good for this push? `{ trusted, why }`. */
export function trust(record, needed, { isAncestor, changedSince }) {
  if (!record) return { trusted: false, why: `no ${RECORD}` }
  if (record.result !== 'passed') return { trusted: false, why: `the rehearsal it records did not pass (${record.result})` }
  if (!record.commit || !isAncestor(record.commit)) return { trusted: false, why: `the rehearsed commit ${record.commit ?? '(none)'} is not in this push's history` }
  const after = changedSince(record.commit).filter((p) => classOf(p) !== 'none')
  if (after.length) return { trusted: false, why: `code changed after the rehearsal: ${after.slice(0, 3).join(', ')}` }
  const sel = record.selection ?? {}
  if (record.verify !== 'all') return { trusted: false, why: 'the rehearsal did not run all of Verify' }
  if (!sel.full) {
    if (needed.full) return { trusted: false, why: 'this push needs everything, and the rehearsal ran a selection' }
    const missing = needed.suites.filter((s) => !(sel.suites ?? []).includes(s))
    if (missing.length) return { trusted: false, why: `the rehearsal did not run ${missing.slice(0, 3).join(', ')}` }
    if (needed.web && !sel.web) return { trusted: false, why: 'the rehearsal did not run the browser suites' }
    if (needed.harness && !sel.harness) return { trusted: false, why: 'the rehearsal did not run the Postgres harnesses' }
  }
  if (needed.sweepMutate && !sel.sweepMutate) return { trusted: false, why: "the rehearsal did not run the made-sweep's mutations" }
  return { trusted: true, why: `rehearsed ${record.commit.slice(0, 8)} on ${record.at ?? 'an unknown date'}: ${record.jobs ? Object.entries(record.jobs).map(([j, r]) => `${j} ${r}`).join(', ') : 'passed'}` }
}

function decide() {
  const base = argOf('--base')
  const head = argOf('--head')
  const event = argOf('--event')
  const action = argOf('--action')
  if (event && !(event === 'pull_request' && action === 'synchronize')) return EVERYTHING(`a ${event}${action ? ` (${action})` : ''} event has no incremental range`)
  if (!isCommit(base) || !isCommit(head)) return EVERYTHING(`the range ${base ?? '?'}..${head ?? '?'} is not two commits this checkout has`)
  const changes = git('diff', '--name-status', '--no-renames', base, head)
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [status, path] = l.split('\t')
      return { status, path }
    })
  const catalog = 'apps/web/src/lib/i18n/catalogs.ts'
  const catalogDiff = changes.some((c) => c.path === catalog) ? git('diff', '-U0', base, head, '--', catalog) : ''
  const suites = jobSuites(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8'))
  if (!suites.harness.length) return EVERYTHING('ci.yml registers no Postgres-harness suite that could be read')
  const out = affected({ root: ROOT, changes, catalogDiff, suites })
  const recordPath = join(ROOT, RECORD)
  let record = null
  if (existsSync(recordPath)) {
    try {
      record = JSON.parse(readFileSync(recordPath, 'utf8'))
    } catch {
      out.reasons.push(`${RECORD} does not parse, so it is not trusted`)
    }
  }
  const verdict = out.code
    ? trust(record, out, {
        isAncestor: (sha) => {
          if (!isCommit(sha)) return false
          try {
            git('merge-base', '--is-ancestor', sha, head)
            return true
          } catch {
            return false
          }
        },
        changedSince: (sha) => git('diff', '--name-only', sha, head).split('\n').filter(Boolean),
      })
    : { trusted: false, why: 'nothing but prose changed' }
  out.trusted = verdict.trusted
  out.reasons.push(`trusted: ${verdict.trusted ? 'yes' : 'no'} — ${verdict.why}`)
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let out
  try {
    out = decide()
  } catch (e) {
    out = EVERYTHING(`the selection failed (${String(e?.message ?? e).split('\n')[0]})`)
  }
  out.trusted ??= false
  const lines = [
    `code=${out.code}`,
    `full=${out.full}`,
    `suites=|${out.suites.join('|')}|`,
    `web=${out.web}`,
    `harness=${out.harness}`,
    `sweep_mutate=${out.sweepMutate}`,
    `trusted=${out.trusted}`,
  ]
  const ghOut = argOf('--github-output')
  if (ghOut) appendFileSync(ghOut, `${lines.join('\n')}\n`)
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ code: out.code, full: out.full, suites: out.suites, web: out.web, harness: out.harness, sweepMutate: out.sweepMutate, trusted: out.trusted }))
  } else {
    for (const r of out.reasons) console.log(`  ${r}`)
    console.log(lines.map((l) => `  ${l}`).join('\n'))
    console.log(`  ${out.full ? 'everything' : `${out.suites.length} suite(s)`} in the Postgres harnesses${out.web ? ', and the browser suites' : ''}${out.trusted ? ' — trusted to the local rehearsal' : ''}`)
  }
}
