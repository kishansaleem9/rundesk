#!/usr/bin/env node
/**
 * Idempotent: for each journal migration whose SQL hash is not yet recorded,
 * if the database already contains that migration's objects (legacy / manual
 * apply), insert the hash so drizzle-kit migrate becomes a no-op for those steps.
 *
 * Run from repo root after sourcing .env (POSTGRES_USER / POSTGRES_DB optional).
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const container = process.env.DRIZZLE_PG_CONTAINER || 'rundesk-postgres'
const pgUser = process.env.POSTGRES_USER || 'rundesk'
const pgDb = process.env.POSTGRES_DB || 'rundesk'

const repoRoot = path.resolve(__dirname, '..')
const journalPath = path.join(repoRoot, 'packages/db/src/migrations/meta/_journal.json')
const migDir = path.join(repoRoot, 'packages/db/src/migrations')

/** @type {Record<string, string>} */
const sentinelByTag = {
  '0009_workspace_canvases': `SELECT (to_regclass('public.workspace_canvases') IS NOT NULL)`,
  '0010_time_approvals': `SELECT (to_regclass('public.time_approvals') IS NOT NULL)`,
  '0011_announcements': `SELECT (to_regclass('public.announcements') IS NOT NULL)`,
  '0012_announcement_dismissals': `SELECT (to_regclass('public.announcement_dismissals') IS NOT NULL)`,
  '0013_integration_access_requests': `SELECT (to_regclass('public.integration_access_requests') IS NOT NULL)`,
  '0014_workspace_member_capacity': `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspace_members' AND column_name = 'weekly_capacity_hours')`,
  '0015_doc_comments': `SELECT (to_regclass('public.doc_comments') IS NOT NULL)`,
  '0016_webhook_delivery_attempts': `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'webhook_deliveries' AND column_name = 'attempts')`,
  '0017_sso_and_scim': `SELECT (to_regclass('public.sso_connections') IS NOT NULL)`,
  '0018_workspace_groups': `SELECT (to_regclass('public.workspace_groups') IS NOT NULL)`,
  '0019_docs_public_share': `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'docs' AND column_name = 'public_share_id')`,
  '0020_custom_list_statuses': `SELECT (to_regclass('public.list_statuses') IS NOT NULL)`,
  '0021_calendar_sync': `SELECT (to_regclass('public.task_calendar_links') IS NOT NULL)`,
  '0022_email_to_task': `SELECT (to_regclass('public.list_email_aliases') IS NOT NULL)`,
  '0023_custom_roles': `SELECT (to_regclass('public.custom_roles') IS NOT NULL)`,
  '0024_task_templates': `SELECT (to_regclass('public.task_templates') IS NOT NULL)`,
}

function psqlTac(sql) {
  const out = execFileSync(
    'docker',
    ['exec', container, 'psql', '-U', pgUser, '-d', pgDb, '-tAc', sql],
    { encoding: 'utf8' },
  )
  return out.trim()
}

function psqlExec(sql) {
  execFileSync('docker', ['exec', '-i', container, 'psql', '-U', pgUser, '-d', pgDb, '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    encoding: 'utf8',
  })
}

function hashExists(hash) {
  const q = `SELECT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '${hash}')`
  return psqlTac(q) === 't'
}

function journalEntries() {
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
  return [...journal.entries].sort((a, b) => a.idx - b.idx)
}

let inserted = 0
for (const entry of journalEntries()) {
  const tag = entry.tag
  const sqlPath = path.join(migDir, `${tag}.sql`)
  if (!fs.existsSync(sqlPath)) {
    console.error(`Missing migration file: ${sqlPath}`)
    process.exit(1)
  }
  const body = fs.readFileSync(sqlPath, 'utf8')
  const hash = crypto.createHash('sha256').update(body, 'utf8').digest('hex')
  if (hashExists(hash)) continue

  const sentinel = sentinelByTag[tag]
  if (!sentinel) continue

  const applied = psqlTac(sentinel) === 't'
  if (!applied) continue

  const when = Number(entry.when)
  psqlExec(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${when})`,
  )
  inserted += 1
  console.log(`Backfilled migration hash for ${tag}`)
}

console.log(`Drizzle hash backfill done (${inserted} inserted).`)
