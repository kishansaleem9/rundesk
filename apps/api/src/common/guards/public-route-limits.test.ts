import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { HttpException } from '@nestjs/common'
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { PUBLIC_ROUTE_LIMITS, RATE_LIMIT_KEY, RateLimitGuard, type RateLimitOptions } from './rate-limit.guard'
import { PublicImagesController } from '../storage/public-images.controller'
import { DocsPublicController } from '../../modules/docs/docs.controller'
import { ClipsPublicController } from '../../modules/clips/clips.controller'
import { ClientPortalPublicController } from '../../modules/client-portal/client-portal.controller'
import { WorkspacesPublicController } from '../../modules/workspaces/workspaces.controller'
import { PublicStatusController } from '../../modules/support/support.controller'
import { BillingWebhookController } from '../../modules/billing/billing-webhook.controller'
import {
  InboundGitWebhookController,
  InboundWebhookReceiverController,
  InboundZoomWebhookController,
} from '../../modules/inbound-webhooks/inbound-webhooks.controller'
import { InboundEmailController } from '../../modules/email-to-task/email-to-task.controller'
import { IcalFeedController } from '../../modules/calendar-sync/calendar-sync.controller'
import { ScimController } from '../../modules/sso/scim.controller'
import { ZapierController } from '../../modules/zapier/zapier.controller'
import { HealthController } from '../../modules/health/health.controller'

/**
 * THE ROUTES ANYBODY MAY CALL ARE LIMITED PER ADDRESS, AND THE MACHINES' ARE
 * NOT (`found-30-sep/public-routes-unthrottled`).
 *
 * Read the way `RateLimitGuard` reads it: the policy is `@RateLimit` metadata
 * on the handler (or its class), found by `Reflector.getAllAndOverride`, and
 * a route with none is never counted. The guard itself has to be in the
 * route's chain, on its class or on the handler, or the policy is a label
 * nothing reads. `public-route-limits.mjs` measures the refusals on a lane.
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
      getRequest: () => ({ ip, method: 'GET' }),
      getResponse: () => ({ header: (k: string, v: string) => (headers[k] = v) }),
    }),
  } as any
}

/** Thirty seconds into a minute, so no run of these straddles a boundary and the refusal says 30. */
const MID_WINDOW = 1_790_000_010_000

describe('The routes anybody may call are limited per address', () => {
  const THROTTLED: Array<{ route: string; controller: Controller; handler: string; budget: 'page' | 'image' }> = [
    { route: 'GET /public/docs/:slug', controller: DocsPublicController, handler: 'getPublic', budget: 'page' },
    { route: 'GET /public/clips/:token', controller: ClipsPublicController, handler: 'watch', budget: 'page' },
    { route: 'GET /portal/:token', controller: ClientPortalPublicController, handler: 'getPublic', budget: 'page' },
    { route: 'GET /public/workspace-by-domain', controller: WorkspacesPublicController, handler: 'workspaceByDomain', budget: 'page' },
    { route: 'GET /status', controller: PublicStatusController, handler: 'getStatus', budget: 'page' },
    { route: 'GET /public/images/:folder/:name', controller: PublicImagesController, handler: 'show', budget: 'image' },
  ]
  for (const r of THROTTLED) {
    it(`${r.route} carries the ${r.budget} budget, and RateLimitGuard reads it`, () => {
      assert.equal(typeof handlerOf(r.controller, r.handler), 'function', `${r.controller.name}.${r.handler} is not a handler`)
      assert.deepEqual(policyOf(r.controller, r.handler), PUBLIC_ROUTE_LIMITS[r.budget], `${r.route}: no ${r.budget} policy`)
      assert.ok(guardsOf(r.controller, r.handler).includes(RateLimitGuard), `${r.route}: RateLimitGuard is not in its chain`)
    })
  }

  it('the budgets are 120 a minute for a page and 1,200 for a picture, ten times as many', () => {
    assert.deepEqual(PUBLIC_ROUTE_LIMITS.page, { limit: 120, windowMs: 60_000 })
    assert.deepEqual(PUBLIC_ROUTE_LIMITS.image, { limit: 1_200, windowMs: 60_000 })
  })

  it('the 121st open of a shared doc in a minute from one address is refused with 429 and a Retry-After, and another address is still served', async () => {
    mock.timers.enable({ apis: ['Date'], now: MID_WINDOW })
    try {
      const guard = new RateLimitGuard(reflector, fakeStore().db)
      for (let i = 0; i < 120; i++) {
        assert.equal(await guard.canActivate(requestTo(DocsPublicController, 'getPublic', '203.0.113.7')), true, `open ${i + 1} was refused`)
      }
      const headers: Record<string, string> = {}
      await assert.rejects(
        () => guard.canActivate(requestTo(DocsPublicController, 'getPublic', '203.0.113.7', headers)),
        (err: unknown) => err instanceof HttpException && err.getStatus() === 429,
      )
      assert.equal(headers['Retry-After'], '30', 'the refusal says to come back when the minute ends')
      assert.equal(await guard.canActivate(requestTo(DocsPublicController, 'getPublic', '203.0.113.8')), true, 'another address was refused too')
    } finally {
      mock.timers.reset()
    }
  })

  it('the address a shared doc refuses is still served a clip’s link: each route counts on its own', async () => {
    mock.timers.enable({ apis: ['Date'], now: MID_WINDOW })
    try {
      const guard = new RateLimitGuard(reflector, fakeStore().db)
      for (let i = 0; i < 120; i++) await guard.canActivate(requestTo(DocsPublicController, 'getPublic', '203.0.113.7'))
      await assert.rejects(() => guard.canActivate(requestTo(DocsPublicController, 'getPublic', '203.0.113.7')))
      assert.equal(await guard.canActivate(requestTo(ClipsPublicController, 'watch', '203.0.113.7')), true, 'the clip’s link was refused with the doc')
    } finally {
      mock.timers.reset()
    }
  })
})

describe('The machines’ routes are never throttled', () => {
  const MACHINES: Array<{ caller: string; controller: Controller; handlers?: string[] }> = [
    { caller: 'the TLS proxy asking whether to issue a certificate (GET /public/tls/authorize)', controller: WorkspacesPublicController, handlers: ['authorizeTls'] },
    { caller: 'Stripe (POST /billing/webhook)', controller: BillingWebhookController },
    { caller: 'a service posting to an inbound webhook (POST /inbound/webhook/:token)', controller: InboundWebhookReceiverController },
    { caller: 'GitHub and GitLab (POST /inbound/git/:provider)', controller: InboundGitWebhookController },
    { caller: 'Zoom (POST /inbound/zoom)', controller: InboundZoomWebhookController },
    { caller: 'the email provider (POST /inbound/email)', controller: InboundEmailController },
    { caller: 'calendar servers polling a feed (GET /ical/:token.ics)', controller: IcalFeedController },
    { caller: 'an identity provider over SCIM (/scim/v2)', controller: ScimController },
    { caller: 'Zapier (/zapier)', controller: ZapierController },
    { caller: 'a load balancer’s health checks (GET /health)', controller: HealthController },
  ]
  for (const m of MACHINES) {
    it(`${m.caller}: never throttled, with no policy and no RateLimitGuard`, () => {
      const handlers = m.handlers ?? routesOf(m.controller)
      assert.ok(handlers.length > 0, `${m.controller.name} has no routes to read`)
      for (const h of handlers) {
        assert.equal(policyOf(m.controller, h), undefined, `${m.controller.name}.${h} carries a rate-limit policy`)
        assert.ok(!guardsOf(m.controller, h).includes(RateLimitGuard), `${m.controller.name}.${h} runs behind RateLimitGuard`)
      }
    })
  }

  it('the TLS proxy’s asks are never counted, however many come from one address', async () => {
    mock.timers.enable({ apis: ['Date'], now: MID_WINDOW })
    try {
      const { db, rows } = fakeStore()
      const guard = new RateLimitGuard(reflector, db)
      for (let i = 0; i < 2_000; i++) {
        assert.equal(await guard.canActivate(requestTo(WorkspacesPublicController, 'authorizeTls', '10.0.0.1')), true, `ask ${i + 1} was refused`)
      }
      assert.equal(rows.size, 0, 'the asks were counted')
    } finally {
      mock.timers.reset()
    }
  })
})
