import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it, mock } from 'node:test'
import { UnauthorizedException } from '@nestjs/common'
import { compareSync, getRounds, hashSync } from 'bcryptjs'
import { AuthService, hashRefreshToken } from './auth.service'
import { NO_ACCOUNT_HASH, PASSWORD_HASH_COST, passwords } from '../../common/security/password-hash'

// AuthService has a wide constructor; these unit tests exercise only
// `assertTotpSatisfied` (2FA-at-login) and the `validateUser` enumeration fix,
// so unrelated collaborators are stubbed as needed.

type Overrides = {
  security?: any
  usersService?: any
  securitySettings?: any
  db?: any
}

function makeService(overrides: Overrides = {}) {
  const security =
    overrides.security ?? {
      getTotpStatus: mock.fn(async () => ({ enabled: false })),
      validateTotp: mock.fn(async () => true),
    }
  const usersService = overrides.usersService ?? { findByEmail: mock.fn(async () => null) }
  const securitySettings =
    overrides.securitySettings ?? {
      getEffectiveForUser: mock.fn(async () => ({
        settings: { lockoutEnabled: true, lockoutThreshold: 5, lockoutDurationMinutes: 30 },
      })),
    }
  const setCalls: any[] = []
  const db =
    overrides.db ?? {
      update: () => ({
        set: (v: any) => {
          setCalls.push(v)
          return { where: async () => undefined }
        },
      }),
    }

  const svc = new AuthService(
    db as any,
    usersService as any,
    {} as any, // workspacesService
    {} as any, // jwtService
    {} as any, // config
    {} as any, // featureFlagsService
    {} as any, // emailService
    security as any,
    securitySettings as any,
  )
  return { svc, security, usersService, securitySettings, db, setCalls }
}

describe('AuthService.assertTotpSatisfied (2FA at login)', () => {
  it('is a no-op when the account has no verified TOTP secret (flow unchanged)', async () => {
    const security = {
      getTotpStatus: mock.fn(async () => ({ enabled: false })),
      validateTotp: mock.fn(async () => true),
    }
    const { svc } = makeService({ security })
    await assert.doesNotReject(() => svc.assertTotpSatisfied('user-1', undefined))
    // The account isn't 2FA-enabled, so we never even attempt to validate a code.
    assert.equal(security.validateTotp.mock.callCount(), 0)
  })

  it('rejects with 401 { error: totp_required } when enabled and no code supplied', async () => {
    const security = {
      getTotpStatus: mock.fn(async () => ({ enabled: true })),
      validateTotp: mock.fn(async () => true),
    }
    const { svc } = makeService({ security })
    await assert.rejects(
      () => svc.assertTotpSatisfied('user-1', undefined),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException)
        assert.equal(err.getStatus(), 401)
        assert.equal((err.getResponse() as any).error, 'totp_required')
        return true
      },
    )
    // Must NOT issue/verify anything — the code is simply absent.
    assert.equal(security.validateTotp.mock.callCount(), 0)
  })

  it('treats an empty-string code as missing (totp_required)', async () => {
    const security = {
      getTotpStatus: mock.fn(async () => ({ enabled: true })),
      validateTotp: mock.fn(async () => true),
    }
    const { svc } = makeService({ security })
    await assert.rejects(
      () => svc.assertTotpSatisfied('user-1', ''),
      (err: any) => {
        assert.equal(err.getResponse().error, 'totp_required')
        return true
      },
    )
    assert.equal(security.validateTotp.mock.callCount(), 0)
  })

  it('rejects an invalid code with 401 { error: totp_invalid }', async () => {
    const security = {
      getTotpStatus: mock.fn(async () => ({ enabled: true })),
      validateTotp: mock.fn(async () => false),
    }
    const { svc } = makeService({ security })
    await assert.rejects(
      () => svc.assertTotpSatisfied('user-1', '000000'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException)
        assert.equal((err.getResponse() as any).error, 'totp_invalid')
        return true
      },
    )
    assert.equal(security.validateTotp.mock.callCount(), 1)
  })

  it('succeeds with a valid code (delegates to security.validateTotp)', async () => {
    const security = {
      getTotpStatus: mock.fn(async () => ({ enabled: true })),
      validateTotp: mock.fn(async () => true),
    }
    const { svc } = makeService({ security })
    await assert.doesNotReject(() => svc.assertTotpSatisfied('user-1', '123456'))
    assert.equal(security.validateTotp.mock.callCount(), 1)
    assert.deepEqual(security.validateTotp.mock.calls[0].arguments, ['user-1', '123456'])
  })
})

describe('AuthService.validateUser (no lockout enumeration)', () => {
  const settings = {
    getEffectiveForUser: async () => ({
      settings: { lockoutEnabled: true, lockoutThreshold: 5, lockoutDurationMinutes: 30 },
    }),
  }

  it('returns the generic "Invalid credentials" for a currently-locked account', async () => {
    const user = {
      id: 'u1',
      email: 'a@b.com',
      passwordHash: hashSync('correct-horse', 4),
      failedLoginAttempts: 0,
      lockedUntil: new Date(Date.now() + 60 * 60 * 1000), // locked for another hour
      isActive: true,
    }
    const { svc } = makeService({
      usersService: { findByEmail: async () => user },
      securitySettings: settings,
    })
    await assert.rejects(
      // even the CORRECT password must not reveal the lockout state
      () => svc.validateUser('a@b.com', 'correct-horse'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException)
        assert.equal(err.message, 'Invalid credentials')
        assert.doesNotMatch(err.message, /lock/i)
        return true
      },
    )
  })

  it('still locks the account server-side on the threshold attempt, but stays generic', async () => {
    const user = {
      id: 'u1',
      email: 'a@b.com',
      passwordHash: hashSync('correct-horse', 4),
      failedLoginAttempts: 4, // this failed attempt is the 5th → threshold reached
      lockedUntil: null,
      isActive: true,
    }
    const { svc, setCalls } = makeService({
      usersService: { findByEmail: async () => user },
      securitySettings: settings,
    })
    await assert.rejects(
      () => svc.validateUser('a@b.com', 'wrong-password'),
      (err: any) => {
        assert.equal(err.message, 'Invalid credentials')
        assert.doesNotMatch(err.message, /lock|attempt/i)
        return true
      },
    )
    // Enforcement is preserved: a lockedUntil was written even though the client
    // was told nothing about it.
    assert.equal(setCalls.length, 1)
    assert.ok(setCalls[0].lockedUntil instanceof Date)
  })

  it('increments failed attempts (below threshold) and returns the generic message', async () => {
    const user = {
      id: 'u1',
      email: 'a@b.com',
      passwordHash: hashSync('correct-horse', 4),
      failedLoginAttempts: 0,
      lockedUntil: null,
      isActive: true,
    }
    const { svc, setCalls } = makeService({
      usersService: { findByEmail: async () => user },
      securitySettings: settings,
    })
    await assert.rejects(
      () => svc.validateUser('a@b.com', 'wrong-password'),
      (err: any) => {
        assert.equal(err.message, 'Invalid credentials')
        return true
      },
    )
    assert.equal(setCalls.length, 1)
    assert.equal(setCalls[0].failedLoginAttempts, 1)
    assert.equal(setCalls[0].lockedUntil, undefined)
  })
})

/*
 * EVERY REFUSED SIGN-IN TAKES ONE HASH (`found-30-sep/sign-in-time-tells-an-account`).
 *
 * The compares are counted on the one hasher the service uses; each refusal
 * must be answered after exactly one, whatever the account. What each takes
 * on a lane is measured by `password-hash-time.mjs`.
 */
describe('AuthService.validateUser — every refusal takes one hash, whether or not the account exists', () => {
  const settings = {
    getEffectiveForUser: async () => ({
      settings: { lockoutEnabled: true, lockoutThreshold: 5, lockoutDurationMinutes: 30 },
    }),
  }
  /** The service's compares, recorded, each answering as bcrypt would. */
  function countingCompares() {
    const calls: Array<[string, string]> = []
    const spy = mock.method(passwords, 'compare', async (plain: string, hashed: string) => {
      calls.push([plain, hashed])
      return compareSync(plain, hashed)
    })
    return { calls, restore: () => spy.mock.restore() }
  }
  const refusedAsInvalid = (err: any) => err instanceof UnauthorizedException && err.message === 'Invalid credentials'

  it('an email with no account is refused after a compare with NO_ACCOUNT_HASH', async () => {
    const { calls, restore } = countingCompares()
    try {
      const { svc } = makeService({ usersService: { findByEmail: async () => null }, securitySettings: settings })
      await assert.rejects(() => svc.validateUser('nobody@b.com', 'Guess@12345!'), refusedAsInvalid)
      assert.deepEqual(calls, [['Guess@12345!', NO_ACCOUNT_HASH]])
    } finally {
      restore()
    }
  })

  it('an account with no password, which signs in through SSO or Google only, is refused after the same compare', async () => {
    const { calls, restore } = countingCompares()
    try {
      const user = { id: 'u1', email: 'sso@b.com', passwordHash: null, failedLoginAttempts: 0, lockedUntil: null, isActive: true }
      const { svc } = makeService({ usersService: { findByEmail: async () => user }, securitySettings: settings })
      await assert.rejects(() => svc.validateUser('sso@b.com', 'Guess@12345!'), refusedAsInvalid)
      assert.deepEqual(calls, [['Guess@12345!', NO_ACCOUNT_HASH]])
    } finally {
      restore()
    }
  })

  it('a locked account is refused after one compare, its own, whose answer is not read: the right password is refused too', async () => {
    const { calls, restore } = countingCompares()
    try {
      const stored = hashSync('correct-horse', 4)
      const user = {
        id: 'u1',
        email: 'a@b.com',
        passwordHash: stored,
        failedLoginAttempts: 0,
        lockedUntil: new Date(Date.now() + 60 * 60 * 1000),
        isActive: true,
      }
      const { svc } = makeService({ usersService: { findByEmail: async () => user }, securitySettings: settings })
      await assert.rejects(() => svc.validateUser('a@b.com', 'correct-horse'), refusedAsInvalid)
      assert.deepEqual(calls, [['correct-horse', stored]])
    } finally {
      restore()
    }
  })

  it('a locked account’s refusal is not sent before its compare has finished', async () => {
    let finish: (matched: boolean) => void = () => undefined
    const spy = mock.method(passwords, 'compare', () => new Promise<boolean>((resolve) => (finish = resolve)))
    try {
      const user = {
        id: 'u1',
        email: 'a@b.com',
        passwordHash: hashSync('correct-horse', 4),
        failedLoginAttempts: 0,
        lockedUntil: new Date(Date.now() + 60 * 60 * 1000),
        isActive: true,
      }
      const { svc } = makeService({ usersService: { findByEmail: async () => user }, securitySettings: settings })
      const outcome = svc.validateUser('a@b.com', 'wrong-horse').then(() => 'signed in', (err: any) => (refusedAsInvalid(err) ? 'refused' : String(err)))
      await new Promise((resolve) => setTimeout(resolve, 50))
      assert.equal(await Promise.race([outcome, 'still comparing']), 'still comparing', 'the lock was answered before the compare finished')
      finish(true)
      assert.equal(await outcome, 'refused')
    } finally {
      spy.mock.restore()
    }
  })

  it('an account’s compare starts before its sign-in policy is read, so the policy’s queries are not added to a refusal’s time', async () => {
    const order: string[] = []
    const spy = mock.method(passwords, 'compare', async () => {
      order.push('compare')
      return false
    })
    try {
      const user = { id: 'u1', email: 'a@b.com', passwordHash: hashSync('correct-horse', 4), failedLoginAttempts: 0, lockedUntil: null, isActive: true }
      const policy = {
        getEffectiveForUser: async () => {
          order.push('policy')
          return { settings: { lockoutEnabled: true, lockoutThreshold: 5, lockoutDurationMinutes: 30 } }
        },
      }
      const { svc } = makeService({ usersService: { findByEmail: async () => user }, securitySettings: policy })
      await assert.rejects(() => svc.validateUser('a@b.com', 'wrong-horse'), refusedAsInvalid)
      assert.deepEqual(order, ['compare', 'policy'])
    } finally {
      spy.mock.restore()
    }
  })

  it('a real account’s wrong password is compared with its own hash, once', async () => {
    const { calls, restore } = countingCompares()
    try {
      const stored = hashSync('correct-horse', 4)
      const user = { id: 'u1', email: 'a@b.com', passwordHash: stored, failedLoginAttempts: 0, lockedUntil: null, isActive: true }
      const { svc } = makeService({ usersService: { findByEmail: async () => user }, securitySettings: settings })
      await assert.rejects(() => svc.validateUser('a@b.com', 'wrong-horse'), refusedAsInvalid)
      assert.deepEqual(calls, [['wrong-horse', stored]])
    } finally {
      restore()
    }
  })

  it('NO_ACCOUNT_HASH costs what a real password’s hash costs, so the refusals take the same time', () => {
    assert.equal(getRounds(NO_ACCOUNT_HASH), PASSWORD_HASH_COST)
  })

  it('a right password on a hash made at cost 10 signs in, and the account’s hash is made again at 12', async () => {
    const user = { id: 'u1', email: 'a@b.com', passwordHash: hashSync('correct-horse', 10), failedLoginAttempts: 0, lockedUntil: null, isActive: true }
    const { svc, setCalls } = makeService({ usersService: { findByEmail: async () => user }, securitySettings: settings })
    assert.equal((await svc.validateUser('a@b.com', 'correct-horse')).id, 'u1')
    const rehashed = setCalls.find((set) => typeof set.passwordHash === 'string')
    assert.ok(rehashed, `no new hash was written: ${JSON.stringify(setCalls)}`)
    assert.equal(getRounds(rehashed.passwordHash), PASSWORD_HASH_COST)
    assert.equal(compareSync('correct-horse', rehashed.passwordHash), true)
  })

  it('a right password on a hash at today’s cost writes no new hash', async () => {
    const user = { id: 'u1', email: 'a@b.com', passwordHash: hashSync('correct-horse', PASSWORD_HASH_COST), failedLoginAttempts: 0, lockedUntil: null, isActive: true }
    const { svc, setCalls } = makeService({ usersService: { findByEmail: async () => user }, securitySettings: settings })
    assert.equal((await svc.validateUser('a@b.com', 'correct-horse')).id, 'u1')
    assert.deepEqual(setCalls, [])
  })
})

// ---------------------------------------------------------------------------
// Refresh-token hashing at rest (sessions.refreshToken stores a SHA-256 hash,
// never the raw JWT). These tests exercise the issue/rotation storage, the
// hash-based lookup in refresh/logout, the legacy raw-token migration fallback,
// and the isCurrent/keep-current comparisons that also hash the presented token.
// ---------------------------------------------------------------------------

/** Extract { column, value } from a single drizzle `eq(column, value)` condition. */
function readEq(cond: any): { column?: string; value?: unknown } {
  let column: string | undefined
  let value: unknown
  for (const chunk of cond?.queryChunks ?? []) {
    const kind = chunk?.constructor?.name
    if (kind === 'Param') value = chunk.value
    else if (typeof chunk?.name === 'string' && column === undefined) column = chunk.name
  }
  return { column, value }
}

/**
 * Chainable drizzle stand-in that returns queued select rows in order and
 * records every insert, update, and the value each `.where(eq(...))` matches on
 * — enough to assert WHICH value a lookup keyed on (hash vs raw).
 */
function recordingDb(selectResults: any[][] = []) {
  const queue = [...selectResults]
  const selectWheres: Array<{ column?: string; value?: unknown }> = []
  const inserts: any[] = []
  const updates: Array<{ set: any; where: { column?: string; value?: unknown } }> = []

  const db: any = {
    select: () => {
      const rows = queue.shift() ?? []
      const node: any = Promise.resolve(rows)
      node.from = () => node
      node.innerJoin = () => node
      node.orderBy = () => node
      node.limit = () => node
      node.where = (cond: any) => {
        selectWheres.push(readEq(cond))
        return node
      }
      return node
    },
    insert: () => ({
      values: (values: any) => {
        inserts.push(values)
        const node: any = Promise.resolve([{ id: 'sess-new', ...values }])
        node.returning = () => Promise.resolve([{ id: 'sess-new', ...values }])
        return node
      },
    }),
    update: () => ({
      set: (set: any) => ({
        where: (cond: any) => {
          updates.push({ set, where: readEq(cond) })
          return Promise.resolve(undefined)
        },
      }),
    }),
  }

  return { db, selectWheres, inserts, updates }
}

type SvcOverrides = {
  db?: any
  usersService?: any
  workspacesService?: any
  jwtService?: any
  config?: any
  featureFlagsService?: any
  security?: any
  securitySettings?: any
}

function makeAuthService(over: SvcOverrides = {}) {
  return new AuthService(
    (over.db ?? {}) as any,
    (over.usersService ?? {}) as any,
    (over.workspacesService ?? {}) as any,
    (over.jwtService ?? {}) as any,
    (over.config ?? {}) as any,
    (over.featureFlagsService ?? {}) as any,
    {} as any, // emailService (unused by these paths)
    (over.security ?? {}) as any,
    (over.securitySettings ?? {}) as any,
  ) as any
}

describe('hashRefreshToken (refresh-token hashing at rest)', () => {
  it('is the SHA-256 hex digest of the token, never the token itself', () => {
    const raw = 'header.payload.signature'
    assert.equal(hashRefreshToken(raw), createHash('sha256').update(raw).digest('hex'))
    assert.notEqual(hashRefreshToken(raw), raw)
    assert.match(hashRefreshToken(raw), /^[0-9a-f]{64}$/)
  })

  it('is deterministic and distinct per token', () => {
    assert.equal(hashRefreshToken('a'), hashRefreshToken('a'))
    assert.notEqual(hashRefreshToken('a'), hashRefreshToken('b'))
  })
})

describe('AuthService.login — refresh token stored hashed', () => {
  it('persists the SHA-256 hash but hands the raw token back to the client', async () => {
    const { db, inserts } = recordingDb([[]]) // org-memberships lookup → none
    const svc = makeAuthService({
      db,
      workspacesService: { findByMember: async () => [] },
      /*
       * `login` resolves the governing workspace through `getEffectiveForUser`,
       * the same call `validateUser` already used. It used to take
       * `memberships[0]` from a query with no ORDER BY and then call `get()`
       * with whatever that returned, so this stub only had to answer `get`.
       */
      securitySettings: {
        getEffectiveForUser: async () => ({
          settings: {
            workspaceId: null,
            sessionTimeoutMinutes: 60,
            maxConcurrentSessions: 0,
            ipAllowlistEnabled: false,
            ipAllowlist: [],
            ipAllowlistIncludeAdmins: false,
          },
          isWorkspaceAdmin: false,
        }),
      },
      featureFlagsService: { resolveForUser: async () => ({ flags: {} }) },
      jwtService: { sign: (payload: any) => (payload?.type === 'refresh' ? 'RAW-REFRESH-JWT' : 'ACCESS-JWT') },
      config: { getOrThrow: () => 'refresh-secret' },
      security: { logAuditEvent: async () => undefined },
    })

    const bundle = await svc.login({ id: 'u1', email: 'a@b.com', role: 'member', passwordHash: 'x' })

    assert.equal(inserts.length, 1)
    // Stored value is the hash — never the raw JWT.
    assert.equal(inserts[0].refreshToken, hashRefreshToken('RAW-REFRESH-JWT'))
    assert.notEqual(inserts[0].refreshToken, 'RAW-REFRESH-JWT')
    // The raw token is still returned to the caller (cookie/body).
    assert.equal(bundle.refreshToken, 'RAW-REFRESH-JWT')
  })
})

describe('AuthService.refresh — locate session by hash', () => {
  it('looks the session up by the token hash, then rotates (revoke + re-issue)', async () => {
    const raw = 'RAW-REFRESH'
    const stored = {
      id: 's1',
      refreshToken: hashRefreshToken(raw),
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    }
    const { db, selectWheres, updates } = recordingDb([[stored]])
    const svc = makeAuthService({
      db,
      jwtService: { verify: () => ({ sub: 'u1', type: 'refresh' }) },
      usersService: { findById: async () => ({ id: 'u1', email: 'a@b.com', role: 'member' }) },
      config: { getOrThrow: () => 'refresh-secret' },
    })
    const login = mock.fn(async () => ({ accessToken: 'a', refreshToken: 'NEW', user: {}, workspaces: [], organizations: [] }))
    svc.login = login

    await svc.refresh(raw)

    // The first lookup keys on the HASH of the presented token, not the raw value.
    assert.equal(selectWheres[0].column, 'refresh_token')
    assert.equal(selectWheres[0].value, hashRefreshToken(raw))
    assert.notEqual(selectWheres[0].value, raw)
    // The located session is revoked by id (rotation) and a new one issued via login().
    assert.ok(updates.some((u) => u.set.isRevoked === true && u.where.value === 's1'))
    assert.equal(login.mock.callCount(), 1)
  })
})

describe('AuthService.logout — locate session by hash', () => {
  it('finds the session by token hash and revokes it by id', async () => {
    const raw = 'RAW-REFRESH'
    const stored = {
      id: 's9',
      refreshToken: hashRefreshToken(raw),
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    }
    const { db, selectWheres, updates } = recordingDb([[stored]])
    const svc = makeAuthService({ db })

    await svc.logout(raw)

    assert.equal(selectWheres[0].value, hashRefreshToken(raw))
    assert.ok(updates.some((u) => u.set.isRevoked === true && u.where.column === 'id' && u.where.value === 's9'))
  })
})

describe('AuthService — legacy plaintext session fallback (migration-in-place)', () => {
  it('falls back to the raw lookup and upgrades the stored token to its hash', async () => {
    const raw = 'RAW-LEGACY'
    const legacy = {
      id: 's2',
      refreshToken: raw, // stored plaintext (pre-hashing)
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    }
    // First (hash) lookup misses; second (raw) lookup hits the old plaintext row.
    const { db, selectWheres, updates } = recordingDb([[], [legacy]])
    const svc = makeAuthService({
      db,
      jwtService: { verify: () => ({ sub: 'u1' }) },
      usersService: { findById: async () => ({ id: 'u1', email: 'a@b.com', role: 'member' }) },
      config: { getOrThrow: () => 'refresh-secret' },
    })
    svc.login = mock.fn(async () => ({ accessToken: 'a', refreshToken: 'NEW', user: {}, workspaces: [], organizations: [] }))

    await svc.refresh(raw)

    assert.equal(selectWheres[0].value, hashRefreshToken(raw)) // hash lookup (missed)
    assert.equal(selectWheres[1].value, raw) // raw fallback (hit)
    // The old row's refreshToken is re-stored as the hash (upgraded on first use).
    assert.ok(updates.some((u) => u.set.refreshToken === hashRefreshToken(raw) && u.where.value === 's2'))
  })
})

describe('AuthService.refresh — unknown token yields no session', () => {
  it('throws (no rotation) when neither the hash nor the raw lookup finds a session', async () => {
    const { db } = recordingDb([[], []]) // both lookups miss
    const login = mock.fn(async () => ({}) as any)
    const svc = makeAuthService({
      db,
      jwtService: { verify: () => ({ sub: 'u1' }) },
      config: { getOrThrow: () => 'refresh-secret' },
    })
    svc.login = login

    await assert.rejects(
      () => svc.refresh('WRONG'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException)
        assert.equal(err.message, 'Session expired')
        return true
      },
    )
    assert.equal(login.mock.callCount(), 0)
  })
})

describe('AuthService.listSessions — isCurrent matches by hash', () => {
  it('marks the row whose stored hash matches the presented raw token, and never leaks the token', async () => {
    const now = Date.now()
    const rows = [
      { id: 's1', userAgent: 'ua1', ipAddress: 'ip1', isRevoked: false, expiresAt: new Date(now + 1000), createdAt: new Date(now), refreshToken: hashRefreshToken('CUR') },
      { id: 's2', userAgent: 'ua2', ipAddress: 'ip2', isRevoked: false, expiresAt: new Date(now + 1000), createdAt: new Date(now - 1000), refreshToken: hashRefreshToken('OTHER') },
    ]
    const { db } = recordingDb([rows])
    const svc = makeAuthService({ db })

    const list = await svc.listSessions('u1', 'CUR')
    const s1 = list.find((r: any) => r.id === 's1')
    const s2 = list.find((r: any) => r.id === 's2')

    assert.equal(s1.isCurrent, true)
    assert.equal(s2.isCurrent, false)
    // The refresh token (hash or otherwise) must never appear in the response.
    assert.ok(!('refreshToken' in s1))
  })

  it('still matches a legacy session whose token is stored raw', async () => {
    const now = Date.now()
    const rows = [
      { id: 's1', userAgent: 'ua', ipAddress: 'ip', isRevoked: false, expiresAt: new Date(now + 1000), createdAt: new Date(now), refreshToken: 'CUR' },
    ]
    const { db } = recordingDb([rows])
    const svc = makeAuthService({ db })

    const list = await svc.listSessions('u1', 'CUR')
    assert.equal(list[0].isCurrent, true)
  })
})

describe('AuthService.revokeOtherSessions — keeps the current session by hash', () => {
  it('revokes every session except the one whose stored hash matches the presented token', async () => {
    const rows = [
      { id: 's1', refreshToken: hashRefreshToken('CUR') },
      { id: 's2', refreshToken: hashRefreshToken('OTHER') },
      { id: 's3', refreshToken: hashRefreshToken('OTHER2') },
    ]
    const { db, updates } = recordingDb([rows])
    const svc = makeAuthService({ db })

    const res = await svc.revokeOtherSessions('u1', 'CUR')

    assert.equal(res.revoked, 2)
    // The current session (s1) is preserved; only the others are revoked.
    assert.ok(updates.every((u) => u.where.value !== 's1'))
    assert.ok(updates.some((u) => u.where.value === 's2'))
    assert.ok(updates.some((u) => u.where.value === 's3'))
  })
})
