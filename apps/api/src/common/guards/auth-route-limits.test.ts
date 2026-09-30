import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { HttpException } from '@nestjs/common'
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { PUBLIC_ROUTE_LIMITS, RATE_LIMIT_KEY, RateLimitGuard, type RateLimitOptions } from './rate-limit.guard'
import { AUTH_ROUTE_LIMITS } from './auth-route-limits'
import { AuthController } from '../../modules/auth/auth.controller'
import { OAuthController } from '../../modules/auth/oauth.controller'
import { InvitationsController } from '../../modules/invitations/invitations.controller'
import { SsoAdminController, SsoAuthController } from '../../modules/sso/sso.controller'
import { IntegrationConnectionsController } from '../../modules/integrations/connections/integration-connections.controller'

/**
 * MAKING AN ACCOUNT, ANSWERING AN INVITATION AND SIGNING IN THROUGH SSO, GOOGLE
 * OR MICROSOFT ARE LIMITED PER ADDRESS (`found-30-sep/register-unthrottled`,
 * `found-30-sep/oauth-routes-unthrottled`); THE OLD REGISTER ROUTE IS RETIRED
 * (`found-30-sep/register-counted-apart-from-signup`).
 *
 * Read the way `RateLimitGuard` reads it: the policy is `@RateLimit` metadata
 * on the handler (or its class), found by `Reflector.getAllAndOverride`, and a
 * route with none is never counted. The guard has to be in the route's chain,
 * on its class or on the handler, or the policy is a label nothing reads.
 * `auth-route-limits.mjs` measures the refusals on a lane.
 */

type Controller = { new (...args: never[]): unknown; name: string; prototype: object }
const reflector = new Reflector()
const handlerOf = (controller: Controller, name: string) => (controller.prototype as Record<string, () => unknown>)[name]
const policyOf = (controller: Controller, name: string) =>
  reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [handlerOf(controller, name), controller])
/** Every guard the route runs behind, its class's and its own. */
const guardsOf = (controller: Controller, name: string): unknown[] => [
  ...((Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[]),
  ...((Reflect.getMetadata(GUARDS_METADATA, handlerOf(controller, name)) ?? []) as unknown[]),
]
/** The controller's route handlers: every method carrying a path. */
const routesOf = (controller: Controller) =>
  Object.getOwnPropertyNames(controller.prototype).filter(
    (n) => n !== 'constructor' && Reflect.getMetadata(PATH_METADATA, handlerOf(controller, n)) !== undefined,
  )

/** The shared Postgres counter, as `rate-limit.guard.test.ts` fakes it: one row per bucket. */
function fakeStore() {
  const rows = new Map<string, number>()
  const db = {
    insert() {
      let bucket = ''
      const chain = {
        values(v: { bucket: string }) {
          bucket = v.bucket
          return chain
        },
        onConflictDoUpdate() {
          return chain
        },
        async returning() {
          const count = (rows.get(bucket) ?? 0) + 1
          rows.set(bucket, count)
          return [{ count }]
        },
      }
      return chain
    },
  }
  return { db: db as any, rows }
}

/** One request to a real route of a real controller, from `ip`. */
function requestTo(controller: Controller, name: string, ip: string, headers: Record<string, string> = {}) {
  return {
    getType: () => 'http',
    getHandler: () => handlerOf(controller, name),
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ ip, method: 'POST' }),
      getResponse: () => ({ header: (k: string, v: string) => (headers[k] = v) }),
    }),
  } as any
}

/** Thirty seconds into a minute, so no run of these straddles a boundary and the refusal says 30. */
const MID_WINDOW = 1_790_000_010_000

describe('Making an account, answering an invitation and signing in through SSO are limited per address', () => {
  const THROTTLED: Array<{ route: string; controller: Controller; handler: string; budget: keyof typeof AUTH_ROUTE_LIMITS }> = [
    { route: 'POST /auth/signup', controller: AuthController, handler: 'signup', budget: 'signUp' },
    { route: 'POST /invitations/claim', controller: InvitationsController, handler: 'claim', budget: 'signUp' },
    { route: 'POST /invitations/decline', controller: InvitationsController, handler: 'decline', budget: 'signUp' },
    { route: 'GET /invitations/preview', controller: InvitationsController, handler: 'preview', budget: 'invitationLink' },
    { route: 'GET /auth/sso/lookup', controller: SsoAuthController, handler: 'lookup', budget: 'ssoLookup' },
    { route: 'GET /auth/sso/:provider/start', controller: SsoAuthController, handler: 'start', budget: 'ssoRedirect' },
    { route: 'GET /auth/sso/oidc/callback', controller: SsoAuthController, handler: 'oidcCallback', budget: 'ssoRedirect' },
    { route: 'POST /auth/sso/saml/callback', controller: SsoAuthController, handler: 'samlCallback', budget: 'ssoRedirect' },
    { route: 'GET /auth/oauth/:provider', controller: OAuthController, handler: 'start', budget: 'oauthRedirect' },
    { route: 'GET /auth/oauth/:provider/callback', controller: OAuthController, handler: 'callback', budget: 'oauthRedirect' },
    { route: 'GET /integrations/oauth/:provider/callback', controller: IntegrationConnectionsController, handler: 'oauthCallback', budget: 'oauthRedirect' },
  ]
  for (const r of THROTTLED) {
    it(`${r.route} carries the ${r.budget} budget, and RateLimitGuard reads it`, () => {
      assert.equal(typeof handlerOf(r.controller, r.handler), 'function', `${r.controller.name}.${r.handler} is not a handler`)
      assert.deepEqual(policyOf(r.controller, r.handler), AUTH_ROUTE_LIMITS[r.budget], `${r.route}: no ${r.budget} policy`)
      assert.ok(guardsOf(r.controller, r.handler).includes(RateLimitGuard), `${r.route}: RateLimitGuard is not in its chain`)
    })
  }

  it('the budgets are sign-up’s ten a minute, a page’s 120 for an invitation’s link, 60 SSO lookups, and 30 of SSO’s redirects and of Google’s and Microsoft’s', () => {
    assert.deepEqual(AUTH_ROUTE_LIMITS.signUp, { limit: 10, windowMs: 60_000 })
    assert.deepEqual(AUTH_ROUTE_LIMITS.invitationLink, { limit: 120, windowMs: 60_000 })
    assert.equal(AUTH_ROUTE_LIMITS.invitationLink, PUBLIC_ROUTE_LIMITS.page, 'an invitation’s link has a public page’s own budget')
    assert.deepEqual(AUTH_ROUTE_LIMITS.ssoLookup, { limit: 60, windowMs: 60_000 })
    assert.deepEqual(AUTH_ROUTE_LIMITS.ssoRedirect, { limit: 30, windowMs: 60_000 })
    assert.deepEqual(AUTH_ROUTE_LIMITS.oauthRedirect, { limit: 30, windowMs: 60_000 })
  })

  it('POST /auth/register is retired: it answers 410 naming sign-up, reads nothing, and makes nothing to count', () => {
    const makes = mock.fn(async () => ({}))
    const controller = new AuthController({ signUp: makes } as any, {} as any)
    assert.equal(AuthController.prototype.register.length, 0, 'the retired route takes a body, a request or a reply')
    assert.throws(
      () => controller.register(),
      (err: unknown) => err instanceof HttpException && err.getStatus() === 410 && /POST \/auth\/signup/.test(err.message),
    )
    assert.equal(makes.mock.callCount(), 0)
    assert.equal(policyOf(AuthController, 'register'), undefined, 'a route that makes nothing carries a budget')
  })

  it('the 11th sign-up in a minute from one address is refused with 429 and a Retry-After, and another address is still served', async () => {
    mock.timers.enable({ apis: ['Date'], now: MID_WINDOW })
    try {
      const guard = new RateLimitGuard(reflector, fakeStore().db)
      for (let i = 0; i < 10; i++) {
        assert.equal(await guard.canActivate(requestTo(AuthController, 'signup', '203.0.113.7')), true, `sign-up ${i + 1} was refused`)
      }
      const headers: Record<string, string> = {}
      await assert.rejects(
        () => guard.canActivate(requestTo(AuthController, 'signup', '203.0.113.7', headers)),
        (err: unknown) => err instanceof HttpException && err.getStatus() === 429,
      )
      assert.equal(headers['Retry-After'], '30', 'the refusal says to come back when the minute ends')
      assert.equal(await guard.canActivate(requestTo(AuthController, 'signup', '203.0.113.8')), true, 'another address was refused too')
    } finally {
      mock.timers.reset()
    }
  })

  it('GET /auth/oauth/providers is never counted: CI’s readiness poll and every login page ask it', async () => {
    assert.equal(policyOf(OAuthController, 'providers'), undefined, 'GET /auth/oauth/providers carries a rate-limit policy')
    mock.timers.enable({ apis: ['Date'], now: MID_WINDOW })
    try {
      const { db, rows } = fakeStore()
      const guard = new RateLimitGuard(reflector, db)
      for (let i = 0; i < 200; i++) assert.equal(await guard.canActivate(requestTo(OAuthController, 'providers', '127.0.0.1')), true)
      assert.equal(rows.size, 0, 'asking for the providers was counted')
    } finally {
      mock.timers.reset()
    }
  })

  it('the integrations routes that need a session are not counted, only the OAuth callback anybody may ask', () => {
    const handlers = routesOf(IntegrationConnectionsController).filter((h) => h !== 'oauthCallback')
    assert.ok(handlers.length >= 5, `only ${handlers.length} other integration routes were read`)
    for (const h of handlers) {
      assert.equal(policyOf(IntegrationConnectionsController, h), undefined, `IntegrationConnectionsController.${h} carries a rate-limit policy`)
      assert.ok(!guardsOf(IntegrationConnectionsController, h).includes(RateLimitGuard), `IntegrationConnectionsController.${h} runs behind RateLimitGuard`)
    }
  })

  it('the routes an invitation’s sender uses, with a session, are not counted', async () => {
    const invitee = new Set(['claim', 'decline', 'preview'])
    const senders = routesOf(InvitationsController).filter((h) => !invitee.has(h))
    assert.ok(senders.length >= 5, `only ${senders.length} other invitation routes were read`)
    for (const h of senders) assert.equal(policyOf(InvitationsController, h), undefined, `InvitationsController.${h} carries a rate-limit policy`)
    mock.timers.enable({ apis: ['Date'], now: MID_WINDOW })
    try {
      const { db, rows } = fakeStore()
      const guard = new RateLimitGuard(reflector, db)
      for (let i = 0; i < 50; i++) await guard.canActivate(requestTo(InvitationsController, 'createSingular', '10.0.0.1'))
      assert.equal(rows.size, 0, 'inviting somebody was counted')
    } finally {
      mock.timers.reset()
    }
  })

  it('the SSO settings a workspace admin changes, with a session, are not counted', () => {
    const handlers = routesOf(SsoAdminController)
    assert.ok(handlers.length >= 3, `only ${handlers.length} SSO settings routes were read`)
    for (const h of handlers) {
      assert.equal(policyOf(SsoAdminController, h), undefined, `SsoAdminController.${h} carries a rate-limit policy`)
      assert.ok(!guardsOf(SsoAdminController, h).includes(RateLimitGuard), `SsoAdminController.${h} runs behind RateLimitGuard`)
    }
  })
})
