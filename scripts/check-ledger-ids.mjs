#!/usr/bin/env node
/*
 * EVERY LEDGER ID CITED IN THE CODE NAMES AN ITEM OF THE LEDGER
 * (`found-25-sep/ledger-ids-cited-unchecked`).
 *
 * Comments, suites and scripts cite the ledger by id — `found-25-sep/…`,
 * `harness/…` — so a reader can find why a line is the way it is. One was
 * committed naming no item (`080102d` cited a `found-25-sep/…` id the ledger
 * called something else), and nothing noticed. This reads every id cited under
 * `apps/`, `test/`, `scripts/`, `deploy/`, `packages/` and `.github/` and fails
 * on one that is no heading of `docs/open-work.md`.
 *
 * A citation wrapped at a hyphen over two comment lines, as `s3-stub.mjs`
 * has it (`found-23-sep/clip-library-lists-the-
 * oldest-200`), is joined before it is read, so it is neither a false failure nor, once
 * joined, a way past the gate.
 *
 * A gate that read nothing answers ok as surely as one that read everything,
 * so a ledger with no headings, or a tree citing no id, is a failure.
 * `check-ledger-ids-cases.mjs` plants trees to fool it.
 *
 *   node scripts/check-ledger-ids.mjs [--list]
 *
 * `--list` prints each cited id and the first place that cites it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.LEDGER_IDS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER = join(ROOT, 'docs', 'open-work.md')
const DIRS = ['apps', 'test', 'scripts', 'deploy', 'packages', '.github']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'build', '.git'])
const TEXT = /\.(m?[jt]sx?|cjs|py|sh|ya?ml|json|md|sql|css|html|awk)$/

/**
 * The ledger's sections: an id is `<section>/<slug>`. A day's finds are
 * `found-<day>-<month>`, the day in one digit or two: this read
 * `found-\\d{2}-sep` alone, so not one of the 68 October ids cited in the tree
 * (`found-5-oct/…` to `found-8-oct/…`) was read, and one naming no item passed
 * (`found-8-oct/the-ledger-id-gate-reads-no-october-id`).
 */
const SECTIONS = ['found-\\d{1,2}-[a-z]{3}', 'ledger-rows', 'commit-log', 'suite-hygiene', 'resume-defects', 'harness', 'product-siblings']
/*
 * Not after a path character, so `test/harness/x` is a path and not a citation.
 * A slug may carry capitals, because the ledger's do: read in lower case only,
 * `suite-hygiene/apiAs-duplicated-62` was cited as `suite-hygiene/api`, an item
 * that does not exist, so the id could not be cited at all (the other,
 * `checks-read-textContent-not-what-is-shown`, was cited without its section).
 */
const CITED = new RegExp(`(?<![A-Za-z0-9_./-])((?:${SECTIONS.join('|')})/[A-Za-z0-9][A-Za-z0-9-]*)`, 'g')
/** A comment line's leader: what a wrapped citation continues after. */
const LEADER = /^\s*(?:\/\/+|\*|#+|<!--|--)?\s*/

const walk = (dir) =>
  !existsSync(dir)
    ? []
    : readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (SKIP_DIRS.has(e.name) ? [] : walk(join(dir, e.name))) : [join(dir, e.name)],
      )

/** Every `{ id, where }` cited in `text`, a citation wrapped at a hyphen joined to its next line. */
export function citationsIn(text, file) {
  const out = []
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(CITED)) {
      let id = m[1]
      if (id.endsWith('-') && m.index + m[0].length === line.trimEnd().length && i + 1 < lines.length) {
        const rest = lines[i + 1].replace(LEADER, '').match(/^[A-Za-z0-9][A-Za-z0-9-]*/)
        if (rest) id += rest[0]
      }
      out.push({ id, where: `${file}:${i + 1}` })
    }
  })
  return out
}

const problems = []
const headings = existsSync(LEDGER)
  ? new Set([...readFileSync(LEDGER, 'utf8').matchAll(/^### `([^`]+)`/gm)].map((m) => m[1]))
  : new Set()
if (headings.size === 0) problems.push(`the ledger (${relative(ROOT, LEDGER)}) has no item headings: nothing was read`)

const self = fileURLToPath(import.meta.url)
const cited = new Map()
for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    if (!TEXT.test(file) || file === self || /check-ledger-ids-cases\.mjs$/.test(file)) continue
    for (const c of citationsIn(readFileSync(file, 'utf8'), relative(ROOT, file))) {
      if (!cited.has(c.id)) cited.set(c.id, [])
      cited.get(c.id).push(c.where)
    }
  }
}
if (cited.size === 0) problems.push('no ledger id is cited anywhere under ' + DIRS.join(', ') + ': nothing was read')

const unknown = [...cited].filter(([id]) => !headings.has(id))
for (const [id, where] of unknown) {
  problems.push(`${id} is no item of ${relative(ROOT, LEDGER)} — cited at ${where.slice(0, 3).join(', ')}${where.length > 3 ? ` and ${where.length - 3} more` : ''}`)
}

if (process.argv.includes('--list')) {
  for (const [id, where] of [...cited].sort()) console.log(`${id}  ${where[0]}`)
}
if (problems.length) {
  console.log('✗ ledger ids cited in the code:')
  for (const p of problems) console.log(`  - ${p}`)
  process.exitCode = 1
} else {
  console.log(`ok — ${cited.size} ledger id(s) cited, each an item of the ledger (${headings.size} headings)`)
}
