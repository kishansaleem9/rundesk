#!/usr/bin/env node
/*
 * THE SCHEMA-AND-MIGRATIONS GATE, ON TREES BUILT TO FOOL IT.
 *
 * `check-schema-declares-migrations.mjs` answers "ok" on the real tree, and a
 * gate whose only observed answer is "ok" cannot be told from one that reads
 * nothing. So each case plants a few migrations and a schema file in a
 * throwaway tree and runs the real gate there, and `--mutate` breaks the gate
 * one rule at a time and requires a case to notice (`lib/mutate.mjs`).
 *
 * The ways a migration's index or check can hide: split over lines, quoted,
 * under `public.`, inside a DO block, dropped and made again. The ways it is
 * allowed to go undeclared: dropped by a later migration, renamed to a name the
 * schema declares, or only in a comment. And the other way round: a name or a
 * table the schema declares that no migration makes.
 *
 *   node scripts/check-schema-declares-migrations-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = process.env.GATE_UNDER_TEST ?? join(HERE, 'check-schema-declares-migrations.mjs')

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

/**
 * Plant migrations ([tag, sql] in journal order) and schema files ({ name: ts })
 * in a throwaway tree and run the gate there.
 */
const plant = (migrations, schema, { journal = true, extraFiles = {} } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'schema-gate-'))
  const put = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text) }
  try {
    const MIG = 'packages/db/src/migrations'
    if (journal) put(`${MIG}/meta/_journal.json`, JSON.stringify({ entries: migrations.map(([tag], idx) => ({ idx, tag })) }))
    for (const [tag, sql] of migrations) put(`${MIG}/${tag}.sql`, sql)
    for (const [name, ts] of Object.entries(schema)) put(`packages/db/src/schema/${name}`, ts)
    for (const [path, text] of Object.entries(extraFiles)) put(path, text)
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', cwd: tmpdir(), env: { ...process.env, SCHEMA_GATE_ROOT: dir } })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const said = (r) => `it exited ${r.code}: ${r.out.trim().split('\n').slice(0, 4).join(' | ')}`

/* One table, made by a migration and declared, with one index each side: the floor every case builds on. */
const TABLE = `CREATE TABLE "widgets" ("id" uuid PRIMARY KEY, "owner_id" uuid, "kind" text NOT NULL, "slug" text);\n`
const INDEX = `CREATE INDEX IF NOT EXISTS "widgets_owner_idx" ON "widgets" ("owner_id");\n`
const HEAD = "import { pgTable, text, uuid, index, uniqueIndex, check } from 'drizzle-orm/pg-core'\nimport { sql } from 'drizzle-orm'\n"
const widgets = (extras = '', column = '') => `${HEAD}export const widgets = pgTable('widgets', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id'),
  kind: text('kind').notNull(),
  slug: text('slug')${column},
}, (t) => [
  index('widgets_owner_idx').on(t.ownerId),
${extras}])
`

console.log('\n▶ the floor')
{
  const r = plant([['0000_widgets', TABLE + INDEX]], { 'widgets.ts': widgets() })
  chk(r.code === 0 && /^ok: 1 indexes/m.test(r.out), 'a table and an index made by a migration and declared in the schema pass', said(r))
}

console.log('\n▶ what a migration makes and the schema must declare')
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_kind', `CREATE INDEX IF NOT EXISTS "widgets_kind_idx"\n  ON "public"."widgets"\n  USING btree ("kind");\n`]], { 'widgets.ts': widgets() })
  chk(r.code === 1 && /index widgets_kind_idx on widgets is made by 0001_kind/.test(r.out), 'an index a migration makes over three lines, under public., is found and named with its migration', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_one_slug', 'CREATE UNIQUE INDEX "uq_widgets_slug" ON "widgets" (lower("slug")) WHERE "slug" IS NOT NULL;\n']], { 'widgets.ts': widgets() })
  chk(r.code === 1 && /index uq_widgets_slug/.test(r.out), 'a unique partial index a migration makes is found', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_kinds', `DO $$ BEGIN\n  ALTER TABLE "widgets" ADD CONSTRAINT "widgets_kind_check" CHECK ("kind" IN ('a','b'));\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\n`]], { 'widgets.ts': widgets() })
  chk(r.code === 1 && /CHECK constraint widgets_kind_check is made by 0001_kinds/.test(r.out), 'a check a migration adds inside a DO block is found', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_kinds', `ALTER TABLE "widgets" DROP CONSTRAINT IF EXISTS "widgets_kind_check";\nALTER TABLE "widgets" ADD CONSTRAINT "widgets_kind_check" CHECK ("kind" <> '');\n`]], { 'widgets.ts': widgets() })
  chk(r.code === 1 && /widgets_kind_check/.test(r.out), 'a check dropped and made again in one migration is left made (read in order)', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_gadgets', 'CREATE TABLE IF NOT EXISTS "gadgets" ("id" uuid PRIMARY KEY);\n']], { 'widgets.ts': widgets() })
  chk(r.code === 1 && /table gadgets is made by 0001_gadgets and not declared/.test(r.out), 'a table a migration makes and the schema does not declare is found', said(r))
}
{
  const r = plant([['0000_widgets', TABLE.replace('"slug" text', '"slug" text NOT NULL UNIQUE') + INDEX]], { 'widgets.ts': widgets() })
  chk(r.code === 1 && /widgets_slug_key/.test(r.out), 'a column a migration makes UNIQUE, with no .unique() in the schema, is found by the name Postgres gives it', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_code', 'ALTER TABLE "widgets" ADD COLUMN IF NOT EXISTS "code" text UNIQUE;\n']], { 'widgets.ts': widgets() })
  chk(r.code === 1 && /widgets_code_key/.test(r.out), 'a column added UNIQUE by ALTER TABLE, not declared unique, is found', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_kind', 'CREATE INDEX "widgets_kind_idx" ON "widgets" ("kind");\n']], { 'widgets.ts': widgets("  // index('widgets_kind_idx').on(t.kind),\n") })
  chk(r.code === 1 && /index widgets_kind_idx/.test(r.out), 'a declaration in a comment declares nothing', said(r))
}

console.log('\n▶ what a migration makes and may leave undeclared')
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_kind', 'CREATE INDEX "widgets_kind_idx" ON "widgets" ("kind");\n'], ['0002_unkind', 'DROP INDEX IF EXISTS "widgets_gone_idx", "widgets_kind_idx";\n']], { 'widgets.ts': widgets() })
  chk(r.code === 0, 'an index a later migration drops, second in a list, needs no declaration', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_kind', 'CREATE INDEX "widgets_kind_idx" ON "widgets" ("kind");\n'], ['0002_rename', 'ALTER INDEX "widgets_kind_idx" RENAME TO "widgets_by_kind";\n']], { 'widgets.ts': widgets("  index('widgets_by_kind').on(t.kind),\n") })
  chk(r.code === 0, 'an index renamed by a later migration is declared under its new name', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_kinds', `ALTER TABLE "widgets" ADD CONSTRAINT "widgets_kind_check" CHECK ("kind" <> '');\n`], ['0002_unkinds', 'ALTER TABLE "widgets" DROP CONSTRAINT IF EXISTS "widgets_kind_check";\n']], { 'widgets.ts': widgets() })
  chk(r.code === 0, 'a check a later migration drops needs no declaration', said(r))
}
{
  const r = plant([['0000_widgets', `${TABLE + INDEX}-- CREATE INDEX "widgets_kind_idx" ON "widgets" ("kind");\n/* CREATE TABLE "gadgets" ("id" uuid); */\n`]], { 'widgets.ts': widgets() })
  chk(r.code === 0, 'an index or a table in a SQL comment is not made', said(r))
}
{
  const r = plant([['0000_widgets', TABLE.replace('"slug" text', '"slug" text NOT NULL UNIQUE') + INDEX]], { 'widgets.ts': widgets('', '.unique()') })
  chk(r.code === 0, 'a column a migration makes UNIQUE is declared by .unique() on it, under drizzle’s other name', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_kinds', `ALTER TABLE "widgets" ADD CONSTRAINT "widgets_kind_check" CHECK ("kind" <> '');\n`]], { 'widgets.ts': widgets("  check('widgets_kind_check', sql`${t.kind} <> ''`),\n") })
  chk(r.code === 0, 'a check declared under the migration’s name passes', said(r))
}

console.log('\n▶ what the schema declares and a migration must make')
{
  const r = plant([['0000_widgets', TABLE + INDEX]], { 'widgets.ts': widgets("  index('widgets_kind_idx').on(t.kind),\n") })
  chk(r.code === 1 && /widgets_kind_idx is declared in the schema and no migration makes it/.test(r.out), 'an index declared in the schema that no migration makes is found', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX]], { 'widgets.ts': widgets('', '.unique()') })
  chk(r.code === 1 && /widgets_slug_unique is declared in the schema and no migration makes it/.test(r.out), 'a .unique() in the schema that no migration makes is found under the name drizzle gives it', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX]], { 'widgets.ts': widgets(), 'gadgets.ts': "import { pgTable, uuid } from 'drizzle-orm/pg-core'\nexport const gadgets = pgTable('gadgets', { id: uuid('id') })\n" })
  chk(r.code === 1 && /table gadgets is declared in the schema and no migration makes it/.test(r.out), 'a table declared in the schema that no migration makes is found', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX], ['0001_kind', 'CREATE INDEX "widgets_kind_idx" ON "widgets" ("kind");\n'], ['0002_unkind', 'DROP INDEX "widgets_kind_idx";\n']], { 'widgets.ts': widgets("  index('widgets_kind_idx').on(t.kind),\n") })
  chk(r.code === 1 && /widgets_kind_idx is declared in the schema and no migration makes it/.test(r.out), 'an index a migration dropped and the schema still declares is found', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX]], { 'widgets.ts': widgets(), 'watchers.ts': "import { pgTable, uuid, unique } from 'drizzle-orm/pg-core'\nexport const w = pgTable('task_watchers', { id: uuid('id') }, (t) => [unique('uq_task_watcher').on(t.id)])\n" })
  chk(r.code === 0, 'the baseline’s own tables and names, which production has from its first push, need no migration', said(r))
}

console.log('\n▶ passing on nothing')
{
  const r = plant([['0000_widgets', TABLE + INDEX]], { 'widgets.ts': widgets() }, { journal: false })
  chk(r.code === 1 && /no migrations to read/.test(r.out), 'no journal is a failure, not a pass', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX]], {})
  chk(r.code === 1 && /no schema to read/.test(r.out), 'no schema directory is a failure', said(r))
}
{
  const r = plant([['0000_widgets', TABLE]], { 'widgets.ts': widgets().replace("  index('widgets_owner_idx').on(t.ownerId),\n", '') })
  chk(r.code === 1 && /no index was found in them/.test(r.out), 'migrations read with no index in them at all is a failure: the reader is not trusted to be right', said(r))
}
{
  const r = plant([['0000_widgets', TABLE + INDEX]], { 'widgets.ts': widgets() }, { extraFiles: { 'packages/db/src/migrations/meta/_journal.json': JSON.stringify({ entries: [{ tag: '0000_widgets' }, { tag: '0001_lost' }] }) } })
  chk(r.code === 1 && /the journal names 0001_lost and there is no 0001_lost\.sql/.test(r.out), 'a journal entry with no file is a failure', said(r))
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.GATE_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8', cwd: join(HERE, '..') })
    return { ok: /^(ok|not ok):/m.test(r.stdout ?? ''), why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: GATE,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'GATE_UNDER_TEST',
    label: 'the gate',
    alive,
    mutations: [
      ['misses-pass', 'process.exitCode = 1', 'process.exitCode = 0'],
      ['indexes-unasked', 'if (!declaredNames.has(name)) problems.push(`index', 'if (false) problems.push(`index'],
      ['constraints-unasked', 'if (!declaredNames.has(name) && !declaredNames.has(v.alias)) problems.push', 'if (false) problems.push'],
      ['tables-unasked', 'if (!declaredTables.has(name) && !LEFT_BEHIND.has(name)) problems.push', 'if (false) problems.push'],
      ['declared-names-unasked', 'if (!made.has(name) && !BASELINE_NAMES.has(name)) problems.push', 'if (false) problems.push'],
      ['declared-tables-unasked', 'if (!tables.has(name) && !BASELINE_TABLES.has(name)) problems.push', 'if (false) problems.push'],
      ['baseline-excuses-every-name', '!BASELINE_NAMES.has(name)) problems.push', 'false) problems.push'],
      ['sql-comments-read', "const sqlStrip = (s) => s.replace(/--[^\\n]*/g, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')", 'const sqlStrip = (s) => s'],
      ['ts-comments-read', "const tsStrip = (s) => s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/(^|\\s)\\/\\/[^\\n]*/g, '$1')", 'const tsStrip = (s) => s'],
      ['drop-index-ignored', 'for (const n of names(m[4])) indexes.delete(n)', 'void 0'],
      ['drop-list-reads-one', 'for (const n of names(m[4])) indexes.delete(n)', 'indexes.delete(names(m[4])[0])'],
      ['rename-ignored', 'if (v) { indexes.delete(m[7]); indexes.set(m[8], v) }', 'void v'],
      ['drop-constraint-ignored', 'else if (/^DROP\\s+CONSTRAINT/i.test(t)) constraints.delete(m[11])', 'else if (/^DROP\\s+CONSTRAINT/i.test(t)) void 0'],
      ['inline-unique-unread', "constraints.set(`${table}_${m[1]}_key`", "void (`${table}_${m[1]}_key`"],
      ['alias-refused', ' && !declaredNames.has(v.alias)) problems.push', ') problems.push'],
      ['add-column-unread', 'if (c) inlineUnique(a[1], c[1], tag)', 'void c'],
      ['dot-unique-unread', 'if (owner) declaredNames.add(`${owner.table}_${m[1]}_unique`)', 'void owner'],
      ['no-journal-passes', "problems.push(`no migrations to read", "void (`no migrations to read"],
      ['no-schema-passes', 'problems.push(`no schema to read', 'void (`no schema to read'],
      ['empty-reader-passes', "if (journal.length > 0 && indexes.size === 0) problems.push", 'if (false) problems.push'],
      ['lost-file-passes', "problems.push(`the journal names ${tag} and there is no ${tag}.sql`); continue", 'continue'],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
