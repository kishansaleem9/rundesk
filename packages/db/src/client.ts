import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Schema = typeof schema
export type Db = PostgresJsDatabase<Schema>

let _db: Db | null = null

export function getDb(connectionString?: string): Db {
  if (_db) return _db
  const url = connectionString ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const client = postgres(url, { prepare: false })
  _db = drizzle(client, { schema })
  return _db
}
