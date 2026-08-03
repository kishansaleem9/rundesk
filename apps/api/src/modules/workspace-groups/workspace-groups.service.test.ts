import { BadRequestException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { WorkspaceGroupsService, normalizeGroupAlias } from './workspace-groups.service'

function buildDb(opts: {
  selectGroups?: any[]
  selectValidMembers?: string[]
} = {}) {
  // We return a chainable .from().where()[.orderBy()] that resolves to the
  // appropriate fixture based on which call mode is exercised by the test.
  return {
    select: mock.fn(() => ({
      from: mock.fn(() => {
        if (opts.selectValidMembers !== undefined) {
          return {
            where: mock.fn(async () =>
              opts.selectValidMembers!.map((userId) => ({ userId })),
            ),
          }
        }
        return {
          where: mock.fn(() => ({
            orderBy: mock.fn(async () => opts.selectGroups ?? []),
          })),
        }
      }),
    })),
    insert: mock.fn(() => ({
      values: mock.fn(() => ({
        returning: mock.fn(async () => [{ id: 'g-1', name: 'Engineering' }]),
        onConflictDoNothing: mock.fn(async () => undefined),
      })),
    })),
  } as any
}

function buildSvc(dbOpts?: Parameters<typeof buildDb>[0]) {
  const db = buildDb(dbOpts)
  const security = { logAuditEvent: mock.fn(async () => undefined) } as any
  return { svc: new WorkspaceGroupsService(db, security), db, security }
}

describe('WorkspaceGroupsService', () => {
  it('list() returns empty array when no groups exist (skips member lookup)', async () => {
    const { svc } = buildSvc({ selectGroups: [] })
    const result = await svc.list('ws-1')
    assert.deepEqual(result, [])
  })

  it('create() rejects empty / whitespace name', async () => {
    const { svc } = buildSvc()
    await assert.rejects(
      () => svc.create('ws-1', 'actor-1', { name: '   ' }),
      (e: unknown) => e instanceof BadRequestException,
    )
  })

  it('create() rejects when supplied memberIds are not workspace members', async () => {
    // First select() is for assertMembersOfWorkspace -> returns only u-known
    // We want the workspace validation to flag u-unknown as missing
    const { svc } = buildSvc({ selectValidMembers: ['u-known'] })
    await assert.rejects(
      () => svc.create('ws-1', 'actor-1', { name: 'Engineering', memberIds: ['u-known', 'u-unknown'] }),
      (e: unknown) =>
        e instanceof BadRequestException && /not workspace members/i.test(e.message),
    )
  })
})

describe('normalizeGroupAlias (§A4.3)', () => {
  it('strips a leading @ and lowercases, so @Design and design are one handle', () => {
    assert.equal(normalizeGroupAlias('@Design'), 'design')
    assert.equal(normalizeGroupAlias('design'), 'design')
  })

  it('folds accents and spaces into a typeable handle', () => {
    assert.equal(normalizeGroupAlias('Diseño Gráfico'), 'diseno-grafico')
  })

  it('returns null when nothing usable survives, leaving the team un-mentionable', () => {
    assert.equal(normalizeGroupAlias('!!!'), null)
    assert.equal(normalizeGroupAlias('a'), null)
    assert.equal(normalizeGroupAlias(null), null)
  })

  it('caps the handle so a pathological name cannot mint a 500-character mention', () => {
    assert.equal(normalizeGroupAlias('x'.repeat(200)), 'x'.repeat(32))
  })
})
