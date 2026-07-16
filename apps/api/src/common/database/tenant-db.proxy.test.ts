import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Db } from '@rundesk/db'
import { createTenantAwareDb } from './database.module'
import { runWithTenantDb, getTenantDb } from './tenant-db.context'

/**
 * Mock drizzle-shaped handle. Each query-builder method records the `this` it
 * was invoked with, so a test can prove the proxy bound the call to the RIGHT
 * target (shared vs a request-scoped dedicated db) — not just that it returned
 * a value.
 */
function makeMockDb(name: string, log: string[]): Db {
  const db = {
    name,
    select(this: { name: string }) {
      log.push(`select@${this.name}`)
      return { __from: this.name }
    },
    async transaction(this: { name: string }, fn: (tx: { tx: string }) => unknown) {
      log.push(`transaction@${this.name}`)
      // drizzle passes a transaction-scoped handle straight into fn (it does not
      // go through our proxy); model that here.
      return fn({ tx: this.name })
    },
    // relational query namespace (db.query.*) — a plain object, not a function.
    query: {
      users: {
        findMany() {
          log.push(`query.users.findMany@${name}`)
          return Promise.resolve([`row-from-${name}`])
        },
      },
    },
  }
  return db as unknown as Db
}

describe('tenant-aware DB proxy (§14.2)', () => {
  it('(a) forwards to the SHARED db when the async store is empty', () => {
    const log: string[] = []
    const shared = makeMockDb('shared', log)
    const proxy = createTenantAwareDb(shared)

    assert.equal(getTenantDb(), undefined, 'precondition: no tenant db installed')

    const result = proxy.select() as unknown as { __from: string }

    assert.equal(result.__from, 'shared', 'query builder resolved against the shared target')
    assert.deepEqual(log, ['select@shared'], 'method bound to the shared target')
  })

  it('(b) forwards to the dedicated db inside runWithTenantDb(otherDb, …)', () => {
    const log: string[] = []
    const shared = makeMockDb('shared', log)
    const other = makeMockDb('other', log)
    const proxy = createTenantAwareDb(shared)

    const result = runWithTenantDb(other, () => proxy.select()) as unknown as { __from: string }

    assert.equal(result.__from, 'other', 'query builder resolved against the dedicated target')
    assert.deepEqual(log, ['select@other'], 'method bound to the dedicated target')
  })

  it('resolves per-access and reverts to shared once the scope exits', () => {
    const log: string[] = []
    const shared = makeMockDb('shared', log)
    const other = makeMockDb('other', log)
    const proxy = createTenantAwareDb(shared)

    runWithTenantDb(other, () => proxy.select())
    proxy.select() // back outside the scope -> shared again

    assert.deepEqual(log, ['select@other', 'select@shared'])
  })

  it('binds db.transaction to the resolved target', async () => {
    const log: string[] = []
    const shared = makeMockDb('shared', log)
    const other = makeMockDb('other', log)
    const proxy = createTenantAwareDb(shared)

    const outside = (await proxy.transaction(async (tx) => tx)) as unknown as { tx: string }
    const inside = (await runWithTenantDb(other, () =>
      proxy.transaction(async (tx) => tx),
    )) as unknown as { tx: string }

    assert.equal(outside.tx, 'shared', 'transaction on shared uses the shared handle')
    assert.equal(inside.tx, 'other', 'transaction inside the scope uses the dedicated handle')
    assert.deepEqual(log, ['transaction@shared', 'transaction@other'])
  })

  it('routes the relational db.query.* namespace to the resolved target', async () => {
    const log: string[] = []
    const shared = makeMockDb('shared', log)
    const other = makeMockDb('other', log)
    const proxy = createTenantAwareDb(shared)

    const fromShared = await proxy.query.users.findMany()
    const fromOther = await runWithTenantDb(other, () => proxy.query.users.findMany())

    assert.deepEqual(fromShared, ['row-from-shared'])
    assert.deepEqual(fromOther, ['row-from-other'])
  })
})
