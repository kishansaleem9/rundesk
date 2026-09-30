import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { EmailController } from './email.controller'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

/**
 * POST /email/test SENDS FOR A SUPER ADMIN AND NOBODY ELSE
 * (`found-30-sep/test-email-route-open`).
 *
 * The route sends any subject and HTML to any address. It had no guard, so
 * outside production it sent for anybody. A session is now required before
 * the handler runs (JwtAuthGuard: anonymous is 401), and the handler sends
 * only for a super admin, as the platform routes do. Production refuses it
 * whoever asks. `auth-route-limits.mjs` reads the refusals on a lane.
 */

const superAdmin = { id: 'root', email: 'root@rundesk.invalid', role: 'super_admin' }
const member = { id: 'u1', email: 'member@rundesk.invalid', role: 'member' }
const body = { to: 'somebody@rundesk.invalid', subject: 'Hello', html: '<p>Hi</p>' }

function controller(nodeEnv: string | undefined = 'development') {
  const sent: Array<Record<string, unknown>> = []
  const emailService = {
    sendTestEmail: async (opts: Record<string, unknown>) => {
      sent.push(opts)
    },
  }
  const config = { get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined) }
  return { ctrl: new EmailController(emailService as never, config as never), sent }
}

describe('POST /email/test', () => {
  it('runs behind JwtAuthGuard, so an anonymous caller never reaches it', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, EmailController.prototype.sendTestEmail) ?? []) as unknown[]
    assert.ok(guards.includes(JwtAuthGuard), 'no JwtAuthGuard on POST /email/test')
  })

  it('refuses an ordinary member with 403, and sends nothing', async () => {
    const { ctrl, sent } = controller()
    await assert.rejects(() => ctrl.sendTestEmail(member as never, body), ForbiddenException)
    await assert.rejects(() => ctrl.sendTestEmail({ ...member, role: 'workspace_admin' } as never, body), ForbiddenException)
    assert.equal(sent.length, 0)
  })

  it('sends one message for a super admin outside production', async () => {
    const { ctrl, sent } = controller('development')
    assert.deepEqual(await ctrl.sendTestEmail(superAdmin as never, body), { ok: true })
    assert.deepEqual(sent, [{ to: body.to, subject: body.subject, html: body.html }])
  })

  it('refuses even a super admin in production', async () => {
    const { ctrl, sent } = controller('production')
    await assert.rejects(() => ctrl.sendTestEmail(superAdmin as never, body), ForbiddenException)
    assert.equal(sent.length, 0)
  })
})
