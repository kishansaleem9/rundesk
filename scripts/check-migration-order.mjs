#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'packages/db/src/migrations')
const SQL_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/

function fail(message) {
  console.error(`[migration-check] ${message}`)
  process.exit(1)
}

function ok(message) {
  console.log(`[migration-check] ${message}`)
}

async function main() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'))
  if (files.length === 0) fail('No migration files found')

  const numbered = files.map((file) => {
    const m = file.match(SQL_NAME)
    if (!m) fail(`Invalid migration filename format: ${file}`)
    return { file, seq: Number(m[1]) }
  })

  const bySeq = new Map()
  for (const row of numbered) {
    if (bySeq.has(row.seq)) fail(`Duplicate migration sequence ${String(row.seq).padStart(4, '0')}`)
    bySeq.set(row.seq, row.file)
  }

  const seqs = [...bySeq.keys()].sort((a, b) => a - b)
  for (let i = 0; i < seqs.length; i++) {
    if (seqs[i] !== i) {
      fail(`Missing sequence ${String(i).padStart(4, '0')} before ${String(seqs[i]).padStart(4, '0')}`)
    }
  }

  // A .sql file on disk is not a migration. drizzle-kit migrate works from
  // meta/_journal.json and ignores anything not listed there — silently, and
  // still reporting "migrations applied successfully". 0093 shipped that way:
  // the file was present, CI was green, and the migration never ran.
  const journalPath = path.join(MIGRATIONS_DIR, 'meta', '_journal.json')
  let journal
  try {
    journal = JSON.parse(await readFile(journalPath, 'utf8'))
  } catch (err) {
    fail(`Could not read ${journalPath}: ${err?.message ?? err}`)
  }

  const tags = (journal.entries ?? []).map((e) => e.tag)
  const tagSet = new Set(tags)
  if (tags.length !== tagSet.size) fail('Duplicate tag in _journal.json')

  for (const { file } of numbered) {
    const tag = file.replace(/\.sql$/, '')
    if (!tagSet.has(tag)) {
      fail(`${file} has no entry in meta/_journal.json — drizzle would skip it silently`)
    }
  }
  for (const tag of tags) {
    if (!bySeq.has(Number(tag.slice(0, 4)))) {
      fail(`_journal.json lists ${tag}, but there is no such .sql file`)
    }
  }

  const idxs = (journal.entries ?? []).map((e) => e.idx)
  for (let i = 0; i < idxs.length; i++) {
    if (idxs[i] !== i) fail(`_journal.json idx out of order at position ${i}: got ${idxs[i]}`)
  }

  ok(
    `Validated ${files.length} migration files with contiguous sequences 0000..${String(seqs.length - 1).padStart(4, '0')}, ` +
      `each present in meta/_journal.json`,
  )
}

main().catch((err) => fail(err?.message ?? String(err)))
