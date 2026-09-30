import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgDialect } from 'drizzle-orm/pg-core'
import { users } from '@rundesk/db'
import { sameEmail, storedAsTypedFirst } from './same-email'

/*
 * ONE EMAIL, IN ANY CASE (`found-30-sep/sign-in-reads-the-email-as-typed`).
 * Rendered into the SQL Postgres is sent, since what matters is that BOTH sides
 * are lowered by the same function; `sign-in-and-password.mjs` measures it on a
 * lane.
 */
const dialect = new PgDialect()
const rendered = (fragment: unknown) => dialect.sqlToQuery(fragment as never)

test('sameEmail lowers the stored email and the typed one alike, in Postgres, and trims what was typed', () => {
  const q = rendered(sameEmail(users.email, '  Ada.Lovelace@Example.COM '))
  assert.equal(q.sql, 'lower("users"."email") = lower($1)')
  assert.deepEqual(q.params, ['Ada.Lovelace@Example.COM'])
})

test('storedAsTypedFirst puts the account stored exactly as typed ahead of one that differs only in case', () => {
  const q = rendered(storedAsTypedFirst(users.email, ' Ada@example.com'))
  assert.equal(q.sql, '("users"."email" = $1) desc')
  assert.deepEqual(q.params, ['Ada@example.com'])
})
