#!/usr/bin/env node
/*
 * The record a passing rehearsal leaves, which CI's `changes` job reads
 * (`scripts/ci-affected.mjs`, `trust`): which commit, against which base, what
 * it selected, and how many steps of each job passed. Written only when every
 * step that ran passed, by `affected.sh` and `all.sh`.
 *
 *   node scripts/ci-rehearsal/record.mjs <commit> <base> <selection json> <results json> <out dir>
 */
const [commit, base, selection, results, out] = process.argv.slice(2)
if (!/^[0-9a-f]{40}$/.test(commit ?? '')) {
  console.error('the commit must be a full sha')
  process.exit(2)
}
const sel = JSON.parse(selection)
const record = {
  result: 'passed',
  commit,
  base,
  at: new Date().toISOString(),
  verify: 'all',
  selection: { full: sel.full, suites: sel.suites, web: sel.web, harness: sel.harness, sweepMutate: sel.sweepMutate },
  jobs: JSON.parse(results),
  logs: out,
}
console.log(JSON.stringify(record, null, 2))
