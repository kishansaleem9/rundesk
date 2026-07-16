import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { UnauthorizedException } from '@nestjs/common'
import { hashSync } from 'bcryptjs'
import { AuthService } from './auth.service'

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
