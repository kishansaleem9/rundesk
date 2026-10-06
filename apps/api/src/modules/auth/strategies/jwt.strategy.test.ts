import test from 'node:test'
import assert from 'node:assert/strict'
import { UnauthorizedException } from '@nestjs/common'
import { JwtStrategy, cookieOrBearerExtractor } from './jwt.strategy'

// The dual extractor is the heart of Plan §1.1's "cookies for browsers, Bearer
// still works" requirement, so it is unit-tested directly.

test('cookieOrBearerExtractor prefers the access_token cookie over the Bearer header', () => {
  const req = { cookies: { access_token: 'cookie-jwt' }, headers: { authorization: 'Bearer header-jwt' } }
  assert.equal(cookieOrBearerExtractor(req as any), 'cookie-jwt')
})

test('cookieOrBearerExtractor falls back to the Bearer header when no cookie is present', () => {
  const req = { cookies: {}, headers: { authorization: 'Bearer header-jwt' } }
  assert.equal(cookieOrBearerExtractor(req as any), 'header-jwt')
})

test('cookieOrBearerExtractor tolerates a missing cookies object (Bearer only)', () => {
  const req = { headers: { authorization: 'Bearer only-bearer' } }
  assert.equal(cookieOrBearerExtractor(req as any), 'only-bearer')
})

test('cookieOrBearerExtractor returns null when neither cookie nor Bearer header is present', () => {
  const req = { cookies: {}, headers: {} }
  assert.equal(cookieOrBearerExtractor(req as any), null)
})

/*
 * A SIGNATURE IS NOT A SESSION (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
 * `validate` reads the session the token names (`sid`) and refuses a token
 * whose session has ended; before, every token that verified read on for its
 * fifteen minutes. The sessions table is answered here by id; a lane measures
 * the six ways a session ends in `sign-in-and-password.mjs`.
 */
const SESSION = '0b6c1f9e-3d5a-4c8e-9f21-7a4b2c6d8e10'
type Row = { userId: string; isRevoked: boolean; expiresAt: Date }
function strategyOver(rows: Record<string, Row>) {
  const asked: string[] = []
  const db = {
    select: () => ({
      from: () => ({
        where: (cond: any) => {
          const id = (cond?.queryChunks ?? []).find((c: any) => c?.constructor?.name === 'Param')?.value as string
          asked.push(id)
          return { limit: async () => (rows[id] ? [rows[id]] : []) }
        },
      }),
    }),
  }
  const strategy = new JwtStrategy({ getOrThrow: () => 'test-access-secret-min-32-chars-aaaaaaa' } as any, db as any)
  return { strategy, asked }
}
const claims = (over: Record<string, unknown> = {}) => ({ sub: 'u1', email: 'a@b.com', role: 'member', workspaceId: 'w1', flags: {}, sid: SESSION, ...over })
const refused = (err: unknown) => err instanceof UnauthorizedException && err.message === 'Session ended'

test('validate refuses a token whose session is revoked, past its window, another person’s or gone, and one that names no session', async () => {
  const later = new Date(Date.now() + 60_000)
  const cases: Array<[string, Record<string, Row>, Record<string, unknown>]> = [
    ['revoked', { [SESSION]: { userId: 'u1', isRevoked: true, expiresAt: later } }, {}],
    ['past its window', { [SESSION]: { userId: 'u1', isRevoked: false, expiresAt: new Date(Date.now() - 1_000) } }, {}],
    ['another person’s', { [SESSION]: { userId: 'u2', isRevoked: false, expiresAt: later } }, {}],
    ['gone', {}, {}],
    ['named by no claim', { [SESSION]: { userId: 'u1', isRevoked: false, expiresAt: later } }, { sid: undefined }],
    ['named by a malformed id', { [SESSION]: { userId: 'u1', isRevoked: false, expiresAt: later } }, { sid: `${SESSION}' or '1'='1` }],
  ]
  for (const [what, rows, over] of cases) {
    const { strategy, asked } = strategyOver(rows)
    await assert.rejects(() => strategy.validate(claims(over)), refused, `a session ${what} was let in`)
    if (what.startsWith('named')) assert.deepEqual(asked, [], `a session ${what} was looked up`)
  }
})

test('validate answers the person while the session the token names is live, reading it once by its id', async () => {
  const { strategy, asked } = strategyOver({ [SESSION]: { userId: 'u1', isRevoked: false, expiresAt: new Date(Date.now() + 60_000) } })
  assert.deepEqual(await strategy.validate(claims()), { id: 'u1', email: 'a@b.com', role: 'member', flags: {}, activeWorkspaceId: 'w1', sid: SESSION })
  assert.deepEqual(asked, [SESSION], 'one read, by the session’s id')
})
