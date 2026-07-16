import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Schema = typeof schema
export type Db = PostgresJsDatabase<Schema>

// One pooled Db per distinct connection string. Callers using the default
// DATABASE_URL all resolve to the same url and therefore share a single pool
// (preserving the previous singleton behaviour); a caller that passes a
// *different* url — e.g. the §14.2 dedicated-database resolver routing an
// enterprise org to its own Postgres — gets its own distinct pool rather than
// silently reusing the shared one.
const _pools = new Map<string, Db>()

export function getDb(connectionString?: string): Db {
  const url = connectionString ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const existing = _pools.get(url)
  if (existing) return existing
  const client = postgres(url, { prepare: false })
  const db = drizzle(client, { schema })
  _pools.set(url, db)
  return db
}
