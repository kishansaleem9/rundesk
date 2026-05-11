#!/usr/bin/env node

import { readdir } from 'node:fs/promises'
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

  ok(`Validated ${files.length} migration files with contiguous sequences 0000..${String(seqs.length - 1).padStart(4, '0')}`)
}

main().catch((err) => fail(err?.message ?? String(err)))
