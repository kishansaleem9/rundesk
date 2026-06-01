// Records every migration listed in meta/_journal.json as already-applied in
// drizzle.__drizzle_migrations, computing drizzle-compatible hashes directly
// from the migration files.
//
// Why: the schema is materialised with `drizzle-kit push` (the TypeScript schema
// is the source of truth — see README.md), which does not populate the drizzle
// migration ledger. drizzle decides what to apply by `created_at` (= each
// journal entry's `when`), so recording every current migration's (hash, when)
// makes a subsequent `drizzle-kit migrate` a correct no-op on a freshly-pushed
// database while still letting genuinely-new migrations apply later.
//
// Idempotent and safe to run repeatedly, and safe on an already-migrated
// database (it only inserts journal entries whose timestamp is not yet
// recorded; the apply decision is timestamp-based, so existing hashes are left
// untouched).

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/migrations')

type JournalEntry = { idx: number; tag: string; when: number }
type Journal = { entries: JournalEntry[] }

// Matches drizzle-orm's readMigrationFiles():
//   crypto.createHash('sha256').update(<raw file contents>).digest('hex')
function drizzleHash(sql: string): string {
  return createHash('sha256').update(sql).digest('hex')
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as Journal
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error('No journal entries found in meta/_journal.json')
  }

  const rows = journal.entries.map((entry) => ({
    tag: entry.tag,
    createdAt: entry.when,
    hash: drizzleHash(readFileSync(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8')),
  }))

  const client = postgres(url, { prepare: false })
  try {
    await client.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle')
    await client.unsafe(
      'CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)',
    )

    let inserted = 0
    for (const row of rows) {
      const res = await client`
        INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
        SELECT ${row.hash}, ${row.createdAt}
        WHERE NOT EXISTS (
          SELECT 1 FROM drizzle.__drizzle_migrations WHERE "created_at" = ${row.createdAt}
        )
      `
      if (res.count > 0) inserted += 1
    }

    console.log(
      `[mark-migrations-applied] ${rows.length} journal entries — ` +
        `${inserted} newly recorded, ${rows.length - inserted} already present`,
    )
  } finally {
    await client.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('[mark-migrations-applied]', err)
  process.exit(1)
})
