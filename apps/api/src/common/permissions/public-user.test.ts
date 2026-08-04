import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTableColumns } from 'drizzle-orm'
import { users } from '@rundesk/db'
import { PUBLIC_USER_COLUMNS, PUBLIC_USER_WITH } from './public-user'

describe('public user projection', () => {
  // Columns that must never reach a client through someone else's payload.
  // A task's creator, a comment's author and a watcher are all other people.
  const SECRET = [
    'passwordHash',
    'failedLoginAttempts',
    'lockedUntil',
    'notificationPreferences',
    'emailVerified',
    'isActive',
  ]

  it('exposes no secret column', () => {
    for (const key of SECRET) {
      assert.equal(key in PUBLIC_USER_COLUMNS, false, `${key} is exposed via PUBLIC_USER_COLUMNS`)
      assert.equal(key in PUBLIC_USER_WITH.columns, false, `${key} is exposed via PUBLIC_USER_WITH`)
    }
  })

  it('keeps both forms of the allow-list in step', () => {
    // Two shapes exist because drizzle's select() and its relational with()
    // disagree about how columns are named. They must still allow the same set,
    // or a field is public through one read path and absent through the other.
    assert.deepEqual(
      Object.keys(PUBLIC_USER_COLUMNS).sort(),
      Object.keys(PUBLIC_USER_WITH.columns).sort(),
    )
  })

  it('names only columns that exist on the users table', () => {
    // A typo here fails open: drizzle would silently drop the key and the
    // field would go missing from every payload rather than erroring.
    const real = new Set(Object.keys(getTableColumns(users)))
    for (const key of Object.keys(PUBLIC_USER_COLUMNS)) {
      assert.equal(real.has(key), true, `${key} is not a column on users`)
    }
  })

  it('still carries what the UI renders a person with', () => {
    for (const key of ['id', 'email', 'displayName', 'avatarUrl']) {
      assert.equal(key in PUBLIC_USER_COLUMNS, true, `${key} is needed to render a person`)
    }
  })
})
