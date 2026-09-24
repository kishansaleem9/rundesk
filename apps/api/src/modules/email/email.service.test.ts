import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { EmailService } from './email.service'

/**
 * What a comment notification hands the mail transport. A reply finds its task
 * by the notification's Message-ID (kept by the notifications service) and by
 * its Reply-To, so both have to reach `sendMail`, not stop at `send`
 * (`resume-defects/resume-8-reply-routing`). No lane has a mail server, so the
 * end-to-end suite reads the kept id and never sees the transport: this does.
 */
describe('EmailService.sendComment — the thread a reply follows', () => {
  const service = () => {
    const config = {
      get: (key: string) => ({ SMTP_HOST: 'smtp.test', SMTP_USER: 'user', SMTP_PASS: 'pass' } as Record<string, string>)[key],
    }
    const svc = new EmailService(config as never)
    const sendMail = mock.fn(async (_mail: Record<string, unknown>) => ({}))
    ;(svc as unknown as { transport: unknown }).transport = { sendMail }
    return { svc, sendMail }
  }
  const comment = {
    to: 'watcher@example.test',
    recipientName: 'Watcher',
    actorName: 'Admin',
    taskTitle: 'A task',
    taskUrl: 'https://app.example.test/t',
    commentSnippet: 'A comment',
    workspaceName: 'Workspace',
  }

  it('sends the Message-ID and the Reply-To it is given', async () => {
    const { svc, sendMail } = service()
    await svc.sendComment({ ...comment, messageId: '<notify.1@inbound.example.test>', replyTo: 'list-abc+task-1@inbound.example.test' })
    assert.equal(sendMail.mock.callCount(), 1)
    const sent = sendMail.mock.calls[0].arguments[0]
    assert.equal(sent.messageId, '<notify.1@inbound.example.test>')
    assert.equal(sent.replyTo, 'list-abc+task-1@inbound.example.test')
  })

  it('and sets neither when it is given neither, so the transport chooses', async () => {
    const { svc, sendMail } = service()
    await svc.sendComment(comment)
    const sent = sendMail.mock.calls[0].arguments[0]
    assert.equal('messageId' in sent, false)
    assert.equal('replyTo' in sent, false)
  })
})
