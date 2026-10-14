#!/usr/bin/env node
/*
 * WHAT A MIGRATION MAKES, THE SCHEMA DECLARES, AND THE OTHER WAY ROUND
 * (`found-30-sep/comment-file-index-only-in-a-migration`).
 *
 * Two builders make a database here, and they read different things. Production
 * runs `drizzle-kit migrate`, which reads the SQL in `packages/db/src/migrations`.
 * The lanes, CI and a fresh deploy run `drizzle-kit push`, which reads only
 * `packages/db/src/schema`. An index or a check that only a migration makes is
 * in production and nowhere a test runs. On 30 September 22 indexes and 10
 * checks were so, three of the indexes unique. Lanes 3 and 4 held two hidden
 * list containers for one space, which production's index refuses: on the
 * lanes `defaultContainerForSpace`'s ON CONFLICT had nothing to conflict with.
 * And lane 4 had stored a view whose visibility was "everybody". The drift gate
 * (`lane_schema_drift`, lane-env.sh) compares a lane with a database built by
 * push, so it could see neither.
 *
 * The other way round is the same mistake: a table, index or check the schema
 * declares and no migration makes is on every lane and missing in production.
 *
 * BY NAME. A migration's index, check and unique constraint are declared under
 * the names the migration gives them, and every table a migration leaves is
 * declared. The definitions were measured once, not here: the old push plus the
 * migrations' own statements, and a push of the new schema, described the same
 * (`schema_describe`), names included. Foreign keys were measured then too: all
 * 160 a migration makes are declared, with the same ON DELETE.
 *
 *   node scripts/check-schema-declares-migrations.mjs
 *   SCHEMA_GATE_ROOT=<tree> reads another tree (the cases do).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.env.SCHEMA_GATE_ROOT ?? process.cwd()
const MIGRATIONS = join(ROOT, 'packages/db/src/migrations')
const SCHEMA = join(ROOT, 'packages/db/src/schema')

/*
 * THE BASELINE. Production's database was made by a push before any migration
 * was written, and `deploy/baseline-drizzle-0000-0008.sql` marks 0000 to 0008
 * applied on it. These tables, and these indexes and constraints on them, were
 * declared in 2e31089, the commit that wrote those migrations, and no migration
 * makes them: production has them from that push. Nothing declared later may
 * join this list; a later table or index needs its migration.
 */
const BASELINE_TABLES = new Set(`
  task_activity task_attachments automations automation_runs chat_channels chat_channel_members chat_messages
  chat_message_reactions task_checklists task_checklist_items task_comments task_comment_reactions
  custom_field_definitions custom_field_values dashboard_presets task_dependencies docs forms form_fields
  form_submissions goals goal_updates invitations labels task_label_assignments notifications user_totp_secrets
  api_keys audit_logs sprints sprint_tasks project_templates time_entries user_dock_configs task_views
  task_watchers webhooks webhook_deliveries organization_members`.trim().split(/\s+/))
const BASELINE_NAMES = new Set(`
  chat_channel_members_unique custom_field_definitions_project_idx custom_field_values_task_field_uniq
  custom_field_values_task_idx uq_task_dep_unique idx_invitations_org_email_pending uq_label_name_per_workspace
  uq_task_label_unique idx_notifications_user_unread idx_api_keys_workspace idx_audit_logs_workspace
  idx_audit_logs_actor sprint_tasks_unique uq_task_watcher uq_organization_members_org_user
  forms_slug_unique invitations_token_unique user_totp_secrets_user_id_unique api_keys_key_hash_unique`.trim().split(/\s+/))

/* A table a migration made that the schema no longer declares, and why it is let be. */
const LEFT_BEHIND = new Map([
  // None now: 0198 moved `task_labels`' rows onto `labels` and dropped it (`found-30-sep/task-labels-left-in-production`).
])

const problems = []
const sqlStrip = (s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
const tsStrip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
const ID = String.raw`(?:"?public"?\.)?"?(\w+)"?`

// ── what the migrations leave, in the order drizzle applies them ─────────────
const indexes = new Map() // name → { table, tag }
const constraints = new Map() // name → { kind, tag }
const tables = new Map() // name → tag
let journal = []
if (!existsSync(join(MIGRATIONS, 'meta', '_journal.json'))) {
  problems.push(`no migrations to read: ${join(MIGRATIONS, 'meta', '_journal.json')} is not there`)
} else {
  journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')).entries.map((e) => e.tag)
}
const EVENT = new RegExp(
  [
    String.raw`CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?${ID}\s+ON\s+(?:ONLY\s+)?${ID}`,
    String.raw`DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?((?:${ID}\s*,\s*)*${ID})`,
    String.raw`ALTER\s+INDEX\s+(?:IF\s+EXISTS\s+)?${ID}\s+RENAME\s+TO\s+${ID}`,
    String.raw`CONSTRAINT\s+${ID}\s+(CHECK|UNIQUE)\b`,
    String.raw`DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?${ID}`,
    String.raw`RENAME\s+CONSTRAINT\s+${ID}\s+TO\s+${ID}`,
    String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${ID}`,
    String.raw`DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?((?:${ID}\s*,\s*)*${ID})`,
    String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${ID}\s+RENAME\s+TO\s+${ID}`,
  ].map((p) => `(?:${p})`).join('|'),
  'gi',
)
const names = (list) => list.split(',').map((n) => n.trim().replace(/"/g, '').replace(/^public\./, ''))
/*
 * A column written `UNIQUE` in a migration, with no CONSTRAINT name: Postgres
 * calls it <table>_<column>_key, and a schema's `.unique()` on that column is
 * pushed as <table>_<column>_unique. The same constraint under two names, so
 * both are recorded, and either declared is enough (0048's webhook token).
 */
const inlineUnique = (table, def, tag) => {
  const m = /^"?(\w+)"?\s+(.*)$/s.exec(def.trim())
  if (!m || /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|LIKE)$/i.test(m[1])) return
  if (/\bUNIQUE\b/i.test(m[2].replace(/REFERENCES[\s\S]*$/i, ''))) {
    constraints.set(`${table}_${m[1]}_key`, { kind: 'UNIQUE', tag, alias: `${table}_${m[1]}_unique` })
  }
}
/** The text inside the parentheses that open at or after `from`, and where they close. */
const body = (text, from) => {
  const open = text.indexOf('(', from)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')' && (depth -= 1) === 0) return text.slice(open + 1, i)
  }
  return ''
}
/** Split on the commas that are not inside parentheses. */
const topLevel = (text) => {
  const out = []
  let depth = 0, cur = ''
  for (const ch of text) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  return [...out, cur]
}
const ADD_COLUMN = new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${ID}([^;]*)`, 'gi')
for (const tag of journal) {
  const file = join(MIGRATIONS, `${tag}.sql`)
  if (!existsSync(file)) { problems.push(`the journal names ${tag} and there is no ${tag}.sql`); continue }
  const sql = sqlStrip(readFileSync(file, 'utf8'))
  for (const m of sql.matchAll(EVENT)) {
    const t = m[0]
    if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(t)) indexes.set(m[2], { table: m[3], tag })
    else if (/^DROP\s+INDEX/i.test(t)) for (const n of names(m[4])) indexes.delete(n)
    else if (/^ALTER\s+INDEX/i.test(t)) { const v = indexes.get(m[7]); if (v) { indexes.delete(m[7]); indexes.set(m[8], v) } }
    else if (/^CONSTRAINT/i.test(t)) constraints.set(m[9], { kind: m[10].toUpperCase(), tag })
    else if (/^DROP\s+CONSTRAINT/i.test(t)) constraints.delete(m[11])
    else if (/^RENAME\s+CONSTRAINT/i.test(t)) { const v = constraints.get(m[12]); if (v) { constraints.delete(m[12]); constraints.set(m[13], v) } }
    else if (/^CREATE\s+TABLE/i.test(t)) {
      tables.set(m[14], tag)
      for (const def of topLevel(body(sql, m.index + t.length))) inlineUnique(m[14], def, tag)
    }
    else if (/^DROP\s+TABLE/i.test(t)) for (const n of names(m[15])) tables.delete(n)
    else if (/^ALTER\s+TABLE/i.test(t)) { const v = tables.get(m[18]); if (v) { tables.delete(m[18]); tables.set(m[19], v) } }
  }
  for (const a of sql.matchAll(ADD_COLUMN)) {
    for (const part of topLevel(a[2])) {
      const c = /^\s*ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\s\S]*)$/i.exec(part)
      if (c) inlineUnique(a[1], c[1], tag)
    }
  }
}

// ── what the schema declares ─────────────────────────────────────────────────
const declaredTables = new Set()
const declaredNames = new Set()
let schemaFiles = 0
if (!existsSync(SCHEMA)) problems.push(`no schema to read: ${SCHEMA} is not there`)
else {
  for (const f of readdirSync(SCHEMA).filter((f) => f.endsWith('.ts'))) {
    schemaFiles += 1
    const src = tsStrip(readFileSync(join(SCHEMA, f), 'utf8'))
    // Where each table's declaration starts, so a column's `.unique()` can be
    // given the name drizzle gives it: <table>_<column>_unique.
    const starts = [...src.matchAll(/pgTable\(\s*['"](\w+)['"]/g)].map((m) => ({ at: m.index, table: m[1] }))
    for (const s of starts) declaredTables.add(s.table)
    for (const m of src.matchAll(/\b(?:index|uniqueIndex|unique|check)\(\s*['"](\w+)['"]/g)) declaredNames.add(m[1])
    for (const m of src.matchAll(/\w+\(\s*['"](\w+)['"][^\n]*?\.unique\(\s*\)/g)) {
      const owner = starts.filter((s) => s.at < m.index).at(-1)
      if (owner) declaredNames.add(`${owner.table}_${m[1]}_unique`)
    }
  }
}
if (journal.length > 0 && indexes.size === 0) problems.push('the migrations were read and no index was found in them: the reader is broken')
if (schemaFiles > 0 && declaredTables.size === 0) problems.push('the schema was read and no table was found in it: the reader is broken')

// ── each way round ───────────────────────────────────────────────────────────
for (const [name, v] of indexes) {
  if (!declaredNames.has(name)) problems.push(`index ${name} on ${v.table} is made by ${v.tag} and not declared in the schema: a pushed database (the lanes, CI) has no such index`)
}
for (const [name, v] of constraints) {
  if (!declaredNames.has(name) && !declaredNames.has(v.alias)) problems.push(`${v.kind} constraint ${name} is made by ${v.tag} and not declared in the schema: a pushed database accepts what production refuses`)
}
for (const [name, tag] of tables) {
  if (!declaredTables.has(name) && !LEFT_BEHIND.has(name)) problems.push(`table ${name} is made by ${tag} and not declared in the schema`)
}
const made = new Set([...indexes.keys(), ...constraints.keys(), ...[...constraints.values()].map((v) => v.alias).filter(Boolean)])
for (const name of declaredNames) {
  if (!made.has(name) && !BASELINE_NAMES.has(name)) problems.push(`${name} is declared in the schema and no migration makes it: production has no such index or constraint`)
}
for (const name of declaredTables) {
  if (!tables.has(name) && !BASELINE_TABLES.has(name)) problems.push(`table ${name} is declared in the schema and no migration makes it: production has no such table`)
}

if (problems.length > 0) {
  for (const p of problems) console.log(`  ✗ ${p}`)
  console.log(`\nnot ok: ${problems.length} difference(s) between what the migrations make and what the schema declares`)
  process.exitCode = 1
} else {
  console.log(
    `ok: ${indexes.size} indexes, ${constraints.size} checks and unique constraints and ${tables.size} tables that ` +
      `${journal.length} migrations leave are declared; ${declaredNames.size} declared names and ${declaredTables.size} ` +
      'declared tables are each made by a migration or the baseline',
  )
}
