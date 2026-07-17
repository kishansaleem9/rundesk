import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { WorkspacesService, computeOnboardingSteps, normalizeHost } from './workspaces.service'
import { WorkspacesPublicController } from './workspaces.controller'

// §14.3 — onboarding checklist done-state is derived purely from real workspace
// counts, so each step auto-checks the moment the data proving it exists.
describe('computeOnboardingSteps (§14.3 onboarding done-state)', () => {
  it('all steps are incomplete for a brand-new workspace (only the creator, no data)', () => {
    const steps = computeOnboardingSteps({ spaces: 0, projects: 0, tasks: 0, members: 1, aiEvents: 0 })
    assert.deepEqual(steps, { space: false, project: false, task: false, invite: false, ai: false })
  })

  it('marks each step done once its underlying object exists', () => {
    const steps = computeOnboardingSteps({ spaces: 2, projects: 1, tasks: 5, members: 3, aiEvents: 4 })
    assert.deepEqual(steps, { space: true, project: true, task: true, invite: true, ai: true })
  })

  it('invite requires a SECOND member — the lone creator does not count', () => {
    assert.equal(computeOnboardingSteps({ spaces: 0, projects: 0, tasks: 0, members: 1, aiEvents: 0 }).invite, false)
    assert.equal(computeOnboardingSteps({ spaces: 0, projects: 0, tasks: 0, members: 2, aiEvents: 0 }).invite, true)
  })

  it('reports steps independently (partial progress)', () => {
    const steps = computeOnboardingSteps({ spaces: 1, projects: 1, tasks: 0, members: 1, aiEvents: 0 })
    assert.deepEqual(steps, { space: true, project: true, task: false, invite: false, ai: false })
  })
})

describe('WorkspacesService.updateMemberRole role allowlist', () => {
  it('rejects assigning super_admin (privilege escalation guard)', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, {} as any, {} as any)
    await assert.rejects(() => svc.updateMemberRole('ws', 'u', 'super_admin'), /Invalid role/)
  })

  it('rejects an unknown role', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, {} as any, {} as any)
    await assert.rejects(() => svc.updateMemberRole('ws', 'u', 'root'), /Invalid role/)
  })
})

// §13.5 — the branding accent color persists through the workspace update, and
// the IP threaded from the controller reaches the audit event.
describe('WorkspacesService.update — accent color + audit IP (§13.3/§13.5)', () => {
  function buildDb() {
    let captured: Record<string, unknown> | null = null
    const db = {
      update: () => ({
        set: (vals: Record<string, unknown>) => {
          captured = vals
          return { where: () => ({ returning: async () => [{ id: 'ws-1', ...vals }] }) }
        },
      }),
    } as any
    return { db, captured: () => captured }
  }

  it('writes accent_color to the update set and records actor IP in the audit event', async () => {
    const { db, captured } = buildDb()
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new WorkspacesService(db, security, {} as any, {} as any, {} as any)

    const row = await svc.update(
      'ws-1',
      { name: 'Acme', primaryColor: '#112233', accentColor: '#abcdef' },
      { id: 'admin-1', email: 'admin@acme.test', ip: '203.0.113.9' },
    )

    assert.equal((row as any).accentColor, '#abcdef')
    assert.equal(captured()?.accentColor, '#abcdef')

    const call = (security.logAuditEvent as any).mock.calls[0].arguments[0]
    assert.equal(call.action, 'workspace.updated')
    assert.equal(call.ipAddress, '203.0.113.9')
    assert.equal(call.metadata.accentColor, '#abcdef')
  })
})

// §13.5 — logo upload presign mirrors the avatar flow: rejects non-images and
// oversized files, and returns an upload + public URL for valid images.
describe('WorkspacesService.createLogoUploadUrl (§13.5)', () => {
  const okR2 = {
    configured: true,
    presignPutObject: async () => 'https://r2.example/upload',
    getObjectUrl: async () => 'https://cdn.example/logo.png',
  } as any

  it('throws when storage is not configured', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, { configured: false } as any, {} as any)
    await assert.rejects(() => svc.createLogoUploadUrl('ws', { contentType: 'image/png' }), /not configured/)
  })

  it('rejects a non-image content type', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, okR2, {} as any)
    await assert.rejects(() => svc.createLogoUploadUrl('ws', { contentType: 'application/pdf' }), /image files/)
  })

  it('rejects an oversized image', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, okR2, {} as any)
    await assert.rejects(
      () => svc.createLogoUploadUrl('ws', { contentType: 'image/png', sizeBytes: 99 * 1024 * 1024 }),
      /limit/,
    )
  })

  it('returns upload + public URLs for a valid image', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, okR2, {} as any)
    const res = await svc.createLogoUploadUrl('ws-7', { contentType: 'image/png', sizeBytes: 1024 })
    assert.equal(res.uploadUrl, 'https://r2.example/upload')
    assert.equal(res.publicUrl, 'https://cdn.example/logo.png')
    assert.match(res.storageKey, /^workspace-logos\/ws-7-[0-9a-f]+\.png$/)
  })
})

// §14.1 — addMember delegates the member-cap check to PlansService BEFORE inserting.
// A no-op for enterprise (unlimited); a hard 403 once a capped plan is full.
describe('WorkspacesService.addMember plan member-limit gate (§14.1)', () => {
  // db.select #1 -> the invited user; #2 -> getMembership (not yet a member).
  function buildDb() {
    let call = 0
    return {
      select: () => ({
        from: () => ({
          where: () => {
            call += 1
            // 1st select: user lookup by email. 2nd: existing membership check.
            return call === 1
              ? Promise.resolve([{ id: 'u-1', email: 'a@b.c' }])
              : Promise.resolve([])
          },
        }),
      }),
      insert: () => ({ values: () => Promise.resolve(undefined) }),
    } as any
  }

  it('blocks the add when PlansService says the plan is at its member cap', async () => {
    const plans = {
      assertCanAddMembers: mock.fn(async () => {
        throw new ForbiddenException('Your Free plan allows up to 5 members')
      }),
    } as any
    const svc = new WorkspacesService(buildDb(), {} as any, {} as any, {} as any, plans)
    await assert.rejects(() => svc.addMember('ws-1', 'a@b.c'), /allows up to 5 members/)
    // Enforced against the right workspace, before any insert.
    assert.equal(plans.assertCanAddMembers.mock.callCount(), 1)
    assert.equal(plans.assertCanAddMembers.mock.calls[0].arguments[0], 'ws-1')
  })
})

// §13.5 — normalizeHost canonicalizes a Host so a custom-domain match is case-,
// port-, scheme-, and www-insensitive on BOTH the incoming host and the stored
// domain.
describe('normalizeHost (§13.5 custom-domain canonicalization)', () => {
  it('lowercases and strips a port', () => {
    assert.equal(normalizeHost('Example.COM:443'), 'example.com')
  })
  it('strips a single leading www.', () => {
    assert.equal(normalizeHost('www.example.com'), 'example.com')
  })
  it('strips scheme, path, and a trailing FQDN dot', () => {
    assert.equal(normalizeHost('https://www.Example.com.:8080/app'), 'example.com')
  })
  it('returns empty string for missing or blank input', () => {
    assert.equal(normalizeHost(''), '')
    assert.equal(normalizeHost(undefined), '')
    assert.equal(normalizeHost('   '), '')
  })
})

// §13.5 / §2.2 — resolveByCustomDomain turns a Host into the workspace that
// serves it, but ONLY when the domain is verified and the workspace is live, and
// returns a safe public projection (never members/tokens/plan limits/flags).
describe('WorkspacesService.resolveByCustomDomain (§13.5 Host -> workspace)', () => {
  // A condition-ignoring mock: it returns the seeded rows for any query, so the
  // service's own JS filtering (verified + not archived + normalized match) is
  // exactly what is under test.
  function svcWithRows(rows: any[]) {
    const db = { select: () => ({ from: () => ({ where: async () => rows }) }) } as any
    return new WorkspacesService(db, {} as any, {} as any, {} as any, {} as any)
  }

  const verified = {
    id: 'ws-1',
    name: 'Acme',
    slug: 'acme',
    logoUrl: 'https://cdn.example/logo.png',
    primaryColor: '#112233',
    accentColor: '#abcdef',
    customDomain: 'example.com',
    customDomainVerified: true,
    isArchived: false,
    // Sensitive / internal columns that must NEVER surface in the projection:
    customDomainToken: 'rundesk-verify=super-secret',
    planLimits: { maxMembers: 3 },
    organizationId: 'org-1',
  }

  it('matches a verified domain case/port/scheme/www-insensitively', async () => {
    for (const host of [
      'example.com',
      'EXAMPLE.com',
      'www.example.com',
      'Example.com:443',
      'https://www.example.com/',
    ]) {
      const res = await svcWithRows([verified]).resolveByCustomDomain(host)
      assert.equal(res?.id, 'ws-1', `host ${host} should resolve`)
    }
  })

  it('matches when the STORED domain carries www./caps but the host does not', async () => {
    const res = await svcWithRows([{ ...verified, customDomain: 'WWW.Example.com' }]).resolveByCustomDomain('example.com')
    assert.equal(res?.id, 'ws-1')
  })

  it('returns ONLY the safe public projection — no token/plan/org/flags', async () => {
    const res = await svcWithRows([verified]).resolveByCustomDomain('example.com')
    assert.deepEqual(Object.keys(res ?? {}).sort(), [
      'accentColor',
      'customDomain',
      'id',
      'logoUrl',
      'name',
      'primaryColor',
      'slug',
    ])
    // Explicitly assert the sensitive fields did not leak through.
    assert.equal((res as any).customDomainToken, undefined)
    assert.equal((res as any).customDomainVerified, undefined)
    assert.equal((res as any).isArchived, undefined)
    assert.equal((res as any).planLimits, undefined)
    assert.equal((res as any).organizationId, undefined)
  })

  it('returns null for an unverified domain', async () => {
    assert.equal(await svcWithRows([{ ...verified, customDomainVerified: false }]).resolveByCustomDomain('example.com'), null)
  })

  it('returns null for an archived workspace', async () => {
    assert.equal(await svcWithRows([{ ...verified, isArchived: true }]).resolveByCustomDomain('example.com'), null)
  })

  it('returns null for an unknown host', async () => {
    assert.equal(await svcWithRows([verified]).resolveByCustomDomain('other.example'), null)
  })

  it('returns null for a blank host without querying the DB', async () => {
    let selected = false
    const db = {
      select: () => {
        selected = true
        return { from: () => ({ where: async () => [] }) }
      },
    } as any
    const svc = new WorkspacesService(db, {} as any, {} as any, {} as any, {} as any)
    assert.equal(await svc.resolveByCustomDomain(''), null)
    assert.equal(selected, false)
  })
})

// §13.5 / §2.2 — isCustomDomainAuthorized is the on-demand-TLS authorization
// decision. It is a thin boolean over resolveByCustomDomain, so the "issue a
// certificate?" answer can never diverge from "does the app serve this host?":
// true only for a VERIFIED, non-archived custom domain; false for everything
// else. False for arbitrary hosts is what stops a proxy from being steered into
// requesting ACME certificates for domains an attacker does not control.
describe('WorkspacesService.isCustomDomainAuthorized (§13.5 on-demand TLS ask)', () => {
  function svcWithRows(rows: any[]) {
    const db = { select: () => ({ from: () => ({ where: async () => rows }) }) } as any
    return new WorkspacesService(db, {} as any, {} as any, {} as any, {} as any)
  }

  const verified = {
    id: 'ws-1',
    name: 'Acme',
    slug: 'acme',
    logoUrl: null,
    primaryColor: null,
    accentColor: null,
    customDomain: 'example.com',
    customDomainVerified: true,
    isArchived: false,
  }

  it('authorizes a verified, live custom domain (case/port/scheme/www-insensitive)', async () => {
    for (const host of ['example.com', 'EXAMPLE.com', 'www.example.com', 'Example.com:443', 'https://www.example.com/']) {
      assert.equal(await svcWithRows([verified]).isCustomDomainAuthorized(host), true, `host ${host}`)
    }
  })

  it('refuses an unverified domain', async () => {
    assert.equal(await svcWithRows([{ ...verified, customDomainVerified: false }]).isCustomDomainAuthorized('example.com'), false)
  })

  it('refuses an archived workspace', async () => {
    assert.equal(await svcWithRows([{ ...verified, isArchived: true }]).isCustomDomainAuthorized('example.com'), false)
  })

  it('refuses an unknown/arbitrary host', async () => {
    assert.equal(await svcWithRows([verified]).isCustomDomainAuthorized('attacker.example'), false)
  })

  it('refuses a blank host', async () => {
    assert.equal(await svcWithRows([verified]).isCustomDomainAuthorized(''), false)
  })
})

// §13.5 / §2.2 — the public GET /public/tls/authorize endpoint is the HTTP "ask"
// a TLS-terminating proxy (e.g. Caddy on_demand_tls) calls: a 2xx means "issue a
// cert for this host", a non-2xx (403 ForbiddenException) means "do not".
// Exercised end-to-end (controller -> service -> normalizeHost /
// resolveByCustomDomain) so the 200-vs-403 contract is genuinely under test.
describe('WorkspacesPublicController.authorizeTls (§13.5 on-demand TLS ask)', () => {
  function controllerWithRows(rows: any[]) {
    const db = { select: () => ({ from: () => ({ where: async () => rows }) }) } as any
    const svc = new WorkspacesService(db, {} as any, {} as any, {} as any, {} as any)
    return new WorkspacesPublicController(svc)
  }

  const verified = {
    id: 'ws-1',
    name: 'Acme',
    slug: 'acme',
    logoUrl: null,
    primaryColor: null,
    accentColor: null,
    customDomain: 'example.com',
    customDomainVerified: true,
    isArchived: false,
  }

  it('returns { ok: true } (HTTP 200) for a verified custom domain via ?domain=', async () => {
    assert.deepEqual(await controllerWithRows([verified]).authorizeTls('example.com'), { ok: true })
  })

  it('authorizes case/port-insensitively, exactly like the resolver', async () => {
    assert.deepEqual(await controllerWithRows([verified]).authorizeTls('EXAMPLE.com:443'), { ok: true })
  })

  it('accepts ?host= as an alias, then the Host header as a last resort', async () => {
    assert.deepEqual(await controllerWithRows([verified]).authorizeTls(undefined, 'example.com'), { ok: true })
    assert.deepEqual(await controllerWithRows([verified]).authorizeTls(undefined, undefined, 'example.com'), { ok: true })
  })

  it('?domain= takes precedence over ?host= and the Host header', async () => {
    // A matching ?domain= authorizes even when the other sources would not…
    assert.deepEqual(
      await controllerWithRows([verified]).authorizeTls('example.com', 'nope.example', 'nope.example'),
      { ok: true },
    )
    // …and a non-matching ?domain= refuses even when the Host header would match.
    await assert.rejects(
      () => controllerWithRows([verified]).authorizeTls('nope.example', undefined, 'example.com'),
      ForbiddenException,
    )
  })

  it('throws ForbiddenException (non-2xx) for an unverified domain', async () => {
    await assert.rejects(
      () => controllerWithRows([{ ...verified, customDomainVerified: false }]).authorizeTls('example.com'),
      ForbiddenException,
    )
  })

  it('throws ForbiddenException (non-2xx) for an archived workspace', async () => {
    await assert.rejects(
      () => controllerWithRows([{ ...verified, isArchived: true }]).authorizeTls('example.com'),
      ForbiddenException,
    )
  })

  it('throws ForbiddenException (non-2xx) for an unknown/arbitrary host', async () => {
    await assert.rejects(
      () => controllerWithRows([verified]).authorizeTls('attacker.example'),
      ForbiddenException,
    )
  })

  it('throws ForbiddenException (non-2xx) when no host is supplied at all', async () => {
    await assert.rejects(() => controllerWithRows([verified]).authorizeTls(), ForbiddenException)
  })
})
