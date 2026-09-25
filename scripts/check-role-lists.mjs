#!/usr/bin/env node
/*
 * A WORKSPACE ROLE LIST IS STATED ONCE (`role-lists-copied-per-module`).
 *
 * Who manages a workspace was an array literal in nine places and who
 * administers it in eight. Identical copies drift one at a time: `views.service`
 * named roles that do not exist (`owner`, `admin`) before anybody noticed, and
 * `space-default-permission` restated its copy on purpose. The lists live in
 * `apps/api/src/common/permissions/workspace-roles.ts` now, and this fails on an
 * array literal holding two or more workspace role names anywhere else in the
 * API's source — `['workspace_admin', 'super_admin']`, `new Set([...])`, an
 * `inArray(…, [...])` or an `@IsIn([...])` alike.
 *
 * `common/permissions` may hold them (the one module is there, and so are the
 * rules built on it); a unit test may spell one out, because stating the
 * expected set is what a test is for. The web cannot import the API's module,
 * so it has its own one place, `hooks/use-workspace-role.ts`, and the same rule
 * everywhere else in `apps/web/src` (the teams page kept a copy).
 *
 * A gate that reads nothing answers "ok" as surely as one that reads
 * everything, so no source directory, or one holding no TypeScript, is a
 * failure. `check-role-lists-cases.mjs` plants trees to fool it.
 *
 *   node scripts/check-role-lists.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.ROLE_LISTS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const API = join(ROOT, 'apps', 'api', 'src')
const WEB = join(ROOT, 'apps', 'web', 'src')
/** Each source tree, and the one place in it a list may be stated. */
const TREES = [
  { src: API, name: 'the API', allowed: (f) => f.startsWith(join(API, 'common', 'permissions') + sep) },
  { src: WEB, name: 'the web', allowed: (f) => f === join(WEB, 'hooks', 'use-workspace-role.ts') },
]
const isSource = (f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts')
const isTest = (f) => /\.test\.tsx?$/.test(f)

const ROLE = `["'\`](?:super_admin|workspace_admin|manager|member|guest)["'\`]`
// Two role names in a row inside a bracket: whitespace, newlines and a comma
// between them, nothing else.
const LIST = new RegExp(`\\[\\s*${ROLE}\\s*,\\s*${ROLE}`, 'g')

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )

const problems = []
const hits = []
let total = 0
for (const tree of TREES) {
  if (!existsSync(tree.src)) {
    problems.push(`no source for ${tree.name} at ${relative(ROOT, tree.src) || tree.src}: nothing was read`)
    continue
  }
  let read = 0
  for (const file of walk(tree.src)) {
    if (!isSource(file)) continue
    read += 1
    if (isTest(file) || tree.allowed(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(LIST)) {
      const line = text.slice(0, m.index).split('\n').length
      hits.push(`${relative(ROOT, file)}:${line}  ${text.split('\n')[line - 1].trim().slice(0, 110)}`)
    }
  }
  if (read === 0) problems.push(`the source for ${tree.name} holds no TypeScript: nothing was read`)
  total += read
}

if (problems.length > 0 || hits.length > 0) {
  for (const p of problems) console.log(`\x1b[31m✗\x1b[0m ${p}`)
  if (hits.length > 0) {
    console.log(`\x1b[31m✗\x1b[0m ${hits.length} workspace role list(s) stated outside their one place — the API's common/permissions/workspace-roles.ts, the web's hooks/use-workspace-role.ts:`)
    for (const h of hits) console.log(`    ${h}`)
  }
  process.exitCode = 1
} else {
  console.log(`\x1b[32mok\x1b[0m ${total} file(s) read, every workspace role list stated in its one place`)
}
