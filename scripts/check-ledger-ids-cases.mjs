#!/usr/bin/env node
/*
 * THE LEDGER-ID GATE, ON PLANTED TREES.
 *
 * Each case plants a ledger and some source in a throwaway tree and runs the
 * gate there: every cited id an item; a misnamed id (the `080102d` miss); a
 * citation wrapped at a hyphen over two comment lines, joined whether it then
 * names an item or not; a path that looks like a section (`test/harness/…`);
 * a citation in a skipped directory; an id with capitals in it, read whole
 * whether the ledger has it or not; an empty ledger; a tree citing nothing.
 * `--mutate` breaks the gate one rule at a time.
 *
 *   node scripts/check-ledger-ids-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = process.env.GATE_UNDER_TEST ?? join(HERE, 'check-ledger-ids.mjs')

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

const LEDGER = [
  '# Open work',
  '',
  '### `found-25-sep/connected-calendars-read-by-nothing` — open, large',
  '',
  '### `found-23-sep/clip-library-lists-the-oldest-200` — **closed**',
  '',
  '### `harness/wt-break-double-vite-build` — open, small',
  '',
].join('\n')
const PAGE = 'apps/web/src/pages/meetings-page.tsx'
const CITES = [
  '/*',
  ' * Nothing reads a calendar into this list (`found-25-sep/connected-calendars-read-by-nothing`).',
  ' */',
  'export const Page = () => null // harness/wt-break-double-vite-build',
].join('\n') + '\n'
const WRAPPED = (tail) => [
  '/*',
  ' * order, was never shown to be wrong (`found-23-sep/clip-library-lists-the-',
  ` * ${tail}\`). S3 sorts keys by their bytes.`,
  ' */',
].join('\n') + '\n'

/** Plant `files` ({ path: text }) in a throwaway tree and run the gate there. */
const plant = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-ids-'))
  try {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) continue
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', cwd: tmpdir(), env: { ...process.env, LEDGER_IDS_ROOT: dir } })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const tree = (over = {}) => ({ 'docs/open-work.md': LEDGER, [PAGE]: CITES, ...over })

console.log('\n▶ what the gate lets be')
{
  const r = plant(tree())
  chk(r.code === 0 && /ok — 2 ledger id\(s\) cited, each an item of the ledger \(3 headings\)/.test(r.out), 'every cited id an item of the ledger: ok, and counted', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'scripts/s3-stub.mjs': WRAPPED('oldest-200') }))
  chk(r.code === 0 && /3 ledger id\(s\) cited/.test(r.out), 'a citation wrapped at a hyphen over two comment lines is joined, and names its item', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'test/e2e/lib/x.mjs': "import '../harness/found-25-sep/nothing-here.mjs'\nconst p = 'test/harness/made-up-path'\n" }))
  chk(r.code === 0 && /2 ledger id\(s\) cited/.test(r.out), 'a path that runs through a section name is not a citation', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'apps/web/node_modules/pkg/index.js': '// found-25-sep/not-ours\n', 'apps/web/dist/a.js': '// found-25-sep/built-copy\n' }))
  chk(r.code === 0, 'node_modules and dist are not read', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  // The ledger's own ids carry capitals (`suite-hygiene/apiAs-duplicated-62`).
  const r = plant(tree({
    'docs/open-work.md': `${LEDGER}### \`suite-hygiene/apiAs-duplicated-62\` — open, medium\n`,
    'test/e2e/x.mjs': "// lib/fixture.mjs's one client (`suite-hygiene/apiAs-duplicated-62`)\n",
  }))
  chk(r.code === 0 && /ok — 3 ledger id\(s\) cited, each an item of the ledger \(4 headings\)/.test(r.out), 'an id with capitals in it is read whole, and names its item', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log('\n▶ what the gate must find')
{
  const r = plant(tree({ 'test/e2e/meetings.mjs': ' * (`found-25-sep/meetings-upcoming-reads-no-calendar`)\n' }))
  chk(r.code === 1 && /found-25-sep\/meetings-upcoming-reads-no-calendar is no item of docs\/open-work\.md — cited at test\/e2e\/meetings\.mjs:1/.test(r.out), 'an id the ledger does not have is a failure, named with where it is cited (the 080102d miss)', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'scripts/s3-stub.mjs': WRAPPED('newest-200') }))
  chk(r.code === 1 && /found-23-sep\/clip-library-lists-the-newest-200 is no item/.test(r.out), 'a wrapped citation is joined before it is read, so a wrong tail is caught too', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'test/e2e/y.mjs': '// (`suite-hygiene/apiAs-duplicated-61`)\n' }))
  chk(r.code === 1 && /suite-hygiene\/apiAs-duplicated-61 is no item/.test(r.out), 'and one the ledger lacks is named whole, not cut at its first capital', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ '.github/workflows/ci.yml': '      # harness/wt-break-tripple-vite-build\n' }))
  chk(r.code === 1 && /harness\/wt-break-tripple-vite-build is no item[\s\S]*ci\.yml:1/.test(r.out), 'a citation in the CI file is read too', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ 'docs/open-work.md': '# Open work\n\nNothing here.\n' }))
  chk(r.code === 1 && /has no item headings: nothing was read/.test(r.out), 'a ledger with no headings is a failure, not a pass', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = plant(tree({ [PAGE]: 'export const Page = () => null\n' }))
  chk(r.code === 1 && /no ledger id is cited anywhere/.test(r.out), 'a tree citing no id is a failure, not a pass', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.GATE_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8' })
    return { ok: /ok\b|✗/.test(`${r.stdout ?? ''}`), why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: GATE,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'GATE_UNDER_TEST',
    label: 'the gate',
    alive,
    mutations: [
      ['misses-pass', '  process.exitCode = 1\n', '  process.exitCode = 0\n'],
      ['unknown-passes', 'const unknown = [...cited].filter(([id]) => !headings.has(id))', 'const unknown = []'],
      ['no-join', "        if (rest) id += rest[0]\n", '\n'],
      ['paths-count', 'const CITED = new RegExp(`(?<![A-Za-z0-9_./-])(', 'const CITED = new RegExp(`(?<![A-Za-z0-9_])('],
      ['lower-case-slugs', "/[A-Za-z0-9][A-Za-z0-9-]*)`, 'g')", "/[a-z0-9][a-z0-9-]*)`, 'g')"],
      ['skips-nothing', "const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'build', '.git'])", 'const SKIP_DIRS = new Set()'],
      ['no-ci', "'deploy', 'packages', '.github']", "'deploy', 'packages']"],
      ['empty-ledger-passes', 'if (headings.size === 0) problems.push(', 'if (false) problems.push('],
      ['nothing-cited-passes', 'if (cited.size === 0) problems.push(', 'if (false) problems.push('],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
