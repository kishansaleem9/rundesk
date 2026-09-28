#!/usr/bin/env node
/*
 * EVERY PERMISSION THE ROLE EDITOR OFFERS IS ASKED SOMEWHERE
 * (`role-editor-offers-unenforced-permissions`).
 *
 * The editor offers every key of `permission-catalog.ts`. Seventeen of its
 * twenty-six were asked by nothing: a grant of one was saved, shown, and
 * changed nothing — the facade class, in the permission system itself. This
 * reads the catalog and the API's source, and fails on an offered key that no
 * `@RequirePermissions(…)`, `hasPermission(…)` or `holdersOf(…)` names, unless
 * it is listed below with the open ledger item that owns it.
 *
 * It fails the other way too:
 *   - on a key asked that the catalog does not have, which no role can hold;
 *   - on an exemption gone stale: its key asked now, gone from the catalog, or
 *     its item closed or missing — so the list only ever shrinks, on purpose.
 *
 * A comment does not ask, and neither does a unit test. A gate that read
 * nothing answers ok as surely as one that read everything, so an empty
 * catalog, or a source tree with no TypeScript, is a failure.
 * `check-permission-keys-asked-cases.mjs` plants trees to fool it, each with
 * exemptions of its own (`PERMISSION_KEYS_EXEMPT`, below), since the real list
 * is empty.
 *
 *   node scripts/check-permission-keys-asked.mjs [--list]
 *
 * `--list` prints each offered key and the first place that asks it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.PERMISSION_KEYS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG = join(ROOT, 'apps', 'api', 'src', 'modules', 'custom-roles', 'permission-catalog.ts')
const API = join(ROOT, 'apps', 'api', 'src')
const LEDGER = join(ROOT, 'docs', 'open-work.md')

/**
 * Offered, and asked by nothing yet: each would be owned by an open ledger
 * item, which says why. None is. The last six were the deletion keys and
 * `doc.publish`: `space.delete`, `project.delete` and `list.delete` are asked
 * for deleting what somebody else made, after Full edit, and the other three
 * left the catalog (`role-editor-offers-unenforced-permissions`).
 */
const EXEMPT_HERE = {}

/**
 * A PLANTED TREE BRINGS ITS OWN: `PERMISSION_KEYS_EXEMPT`, as JSON
 * (`{ "key": "item-slug" }`), replaces the list above when
 * `PERMISSION_KEYS_ROOT` points the gate at a planted tree, so the cases can
 * show the exemption rules biting while the real list is empty. Without a
 * planted root it is ignored, so a variable left in a shell cannot quieten the
 * gate over the repository.
 */
const EXEMPT = process.env.PERMISSION_KEYS_ROOT && process.env.PERMISSION_KEYS_EXEMPT !== undefined
  ? JSON.parse(process.env.PERMISSION_KEYS_EXEMPT)
  : EXEMPT_HERE

/** The calls that ask a key: the route guard's decorator, and the service's two questions. */
const ASKERS = ['RequirePermissions', 'hasPermission', 'holdersOf']

const isSource = (f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts')
const isTest = (f) => /\.test\.tsx?$/.test(f)
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )

/** The text with its comments blanked, lines kept, so a key in a comment asks nothing. */
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')

/** The argument text of each call to `name` in `code`, up to its own closing parenthesis. */
function argumentsOf(code, name) {
  const out = []
  const re = new RegExp(`\\b${name}\\s*\\(`, 'g')
  for (const m of code.matchAll(re)) {
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth += 1
      else if (code[i] === ')') depth -= 1
      i += 1
    }
    out.push({ args: code.slice(start, i - 1), at: m.index })
  }
  return out
}

const problems = []

// ── What the editor offers ─────────────────────────────────────────────────
const catalog = new Set()
if (!existsSync(CATALOG)) {
  problems.push(`no permission catalog at ${relative(ROOT, CATALOG)}: nothing was read`)
} else {
  const code = stripComments(readFileSync(CATALOG, 'utf8'))
  for (const m of code.matchAll(/\{\s*key:\s*'([^']+)'/g)) catalog.add(m[1])
  if (catalog.size === 0) problems.push(`the catalog at ${relative(ROOT, CATALOG)} offers no key: nothing was read`)
}

// ── What the API asks ──────────────────────────────────────────────────────
/** key → where it is asked */
const asked = new Map()
let read = 0
if (!existsSync(API)) {
  problems.push(`no API source at ${relative(ROOT, API) || API}: nothing was read`)
} else {
  for (const file of walk(API)) {
    if (!isSource(file)) continue
    read += 1
    if (isTest(file) || file === CATALOG) continue
    const code = stripComments(readFileSync(file, 'utf8'))
    for (const name of ASKERS) {
      for (const { args, at } of argumentsOf(code, name)) {
        for (const k of args.matchAll(/'([a-z][a-z_]*(?:\.[a-z_]+)+)'/g)) {
          const line = code.slice(0, at).split('\n').length
          if (!asked.has(k[1])) asked.set(k[1], `${relative(ROOT, file)}:${line}`)
        }
      }
    }
  }
  if (read === 0) problems.push(`the API source at ${relative(ROOT, API)} holds no TypeScript: nothing was read`)
}

// ── The ledger's items, for the exemptions ─────────────────────────────────
const items = new Map()
if (existsSync(LEDGER)) {
  for (const m of readFileSync(LEDGER, 'utf8').matchAll(/^### `([^`]+)` — (.*)$/gm)) {
    const id = m[1].includes('/') ? m[1].slice(m[1].indexOf('/') + 1) : m[1]
    items.set(id, m[2])
  }
}

// ── The rules ──────────────────────────────────────────────────────────────
const unasked = []
for (const key of catalog) {
  if (!asked.has(key) && !(key in EXEMPT)) unasked.push(key)
}
if (unasked.length > 0) {
  problems.push(`${unasked.length} key(s) the editor offers are asked by no route or service — a grant of one changes nothing:\n      ${unasked.join('\n      ')}\n    Ask each where its action is, or take it out of the catalog until something does.`)
}
const unknown = [...asked].filter(([key]) => !catalog.has(key))
if (catalog.size > 0 && unknown.length > 0) {
  problems.push(`${unknown.length} key(s) asked that the catalog does not have, so no role can hold them:\n      ${unknown.map(([k, at]) => `${k}  (${at})`).join('\n      ')}`)
}
for (const [key, id] of Object.entries(EXEMPT)) {
  if (asked.has(key)) problems.push(`the exemption for ${key} is stale: it is asked now (${asked.get(key)}) — take it off the list`)
  else if (catalog.size > 0 && !catalog.has(key)) problems.push(`the exemption for ${key} is stale: the catalog no longer offers it — take it off the list`)
  const status = items.get(id)
  if (status === undefined) problems.push(`the exemption for ${key} names ${id}, which is no item of ${relative(ROOT, LEDGER)}`)
  else if (!/^(open|partly)/.test(status)) problems.push(`the exemption for ${key} names ${id}, which is not open (${status.slice(0, 40)}) — ask the key, or re-open the item`)
}

if (process.argv.includes('--list')) {
  for (const key of [...catalog].sort()) console.log(`  ${key.padEnd(38)} ${asked.get(key) ?? (key in EXEMPT ? `exempt: ${EXEMPT[key]}` : 'ASKED BY NOTHING')}`)
}
if (problems.length > 0) {
  for (const p of problems) console.log(`\x1b[31m✗\x1b[0m ${p}`)
  process.exitCode = 1
} else {
  const exempt = Object.keys(EXEMPT).length
  console.log(`\x1b[32mok\x1b[0m ${catalog.size} key(s) offered: ${catalog.size - exempt} asked by a route or service, ${exempt ? `${exempt} exempt, each owned by an open item` : 'none exempt'} (${read} file(s) read)`)
}
