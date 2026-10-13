import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTableColumns, is } from 'drizzle-orm'
import { PgTable, type PgColumn } from 'drizzle-orm/pg-core'
import * as db from '@rundesk/db'
import { SEALED_COLUMNS } from './secrets-at-rest'

/**
 * The secrets Rundesk keeps are kept sealed (`found-13-oct/provider-grants-kept-in-the-clear`):
 * each sealed column seals what it is given when the key is set, gives back in
 * the clear what it sealed, reads a value kept before as it is, and reads one
 * that does not open as empty; and no column that holds a token or a secret is
 * left out of them.
 */

const KEY = 'a'.repeat(64)
const withKey = <T>(key: string | undefined, fn: () => T): T => {
  const before = process.env.TOKEN_ENCRYPTION_KEY
  if (key === undefined) delete process.env.TOKEN_ENCRYPTION_KEY
  else process.env.TOKEN_ENCRYPTION_KEY = key
  try {
    return fn()
  } finally {
    if (before === undefined) delete process.env.TOKEN_ENCRYPTION_KEY
    else process.env.TOKEN_ENCRYPTION_KEY = before
  }
}
const toDriver = (c: PgColumn, v: string) => (c as unknown as { mapToDriverValue: (v: string) => string }).mapToDriverValue(v)
const fromDriver = (c: PgColumn, v: string) => (c as unknown as { mapFromDriverValue: (v: string) => string }).mapFromDriverValue(v)

test('each sealed column seals what it is given under the key, and gives it back in the clear', () => {
  for (const t of SEALED_COLUMNS) {
    for (const [name, c] of Object.entries(t.columns)) {
      withKey(KEY, () => {
        const kept = toDriver(c, `tok-${name}`)
        assert.ok(db.isSealed(kept) && !kept.includes(`tok-${name}`), `${t.name}.${name} kept ${kept}`)
        assert.equal(fromDriver(c, kept), `tok-${name}`, `${t.name}.${name}`)
      })
    }
  }
})

test('a value kept before the key, or written without one, is read as it is; one sealed for another column reads as empty', () => {
  const c = db.emailAccounts.accessToken as unknown as PgColumn
  const other = db.webhooks.secret as unknown as PgColumn
  withKey(undefined, () => assert.equal(toDriver(c, 'plain-token'), 'plain-token'))
  withKey(KEY, () => {
    assert.equal(fromDriver(c, 'plain-token'), 'plain-token')
    assert.equal(fromDriver(c, toDriver(other, 'a-secret')), '')
  })
  withKey('b'.repeat(64), () => assert.equal(fromDriver(c, withKey(KEY, () => toDriver(c, 'tok'))), ''))
})

test('no column that holds a token or a secret is left out of the sealed ones', () => {
  const sealed = new Set(SEALED_COLUMNS.flatMap((t) => Object.values(t.columns)))
  // Not secrets kept for use: a hash compared on sign-in, a capability looked up by
  // its value, and an IMAP password sealed under its own row (`email-accounts.service.ts`).
  const notKeptForUse = new Set(['sessions.refresh_token', 'email_accounts.password_sealed'])
  const missed: string[] = []
  const seen: string[] = []
  for (const value of Object.values(db)) {
    if (!is(value, PgTable)) continue
    const table = (value as unknown as Record<symbol, string>)[Symbol.for('drizzle:Name')]
    for (const c of Object.values(getTableColumns(value as PgTable))) {
      if (!/(^|_)(access_token|refresh_token|secret|client_secret)$/.test(c.name)) continue
      seen.push(`${table}.${c.name}`)
      if (notKeptForUse.has(`${table}.${c.name}`)) continue
      if (!sealed.has(c)) missed.push(`${table}.${c.name}`)
    }
  }
  // Read, not assumed: a scan that found no table would pass on nothing.
  assert.ok(seen.includes('email_accounts.access_token') && seen.includes('user_totp_secrets.secret') && seen.length >= 16, seen.join(', '))
  assert.deepEqual(missed, [])
})
