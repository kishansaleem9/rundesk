import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private readonly client: Resend | null = null
  private readonly from: string

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')
    this.from = this.config.get<string>('EMAIL_FROM') ?? 'noreply@rundesk.internal'
    if (apiKey) {
      this.client = new Resend(apiKey)
    } else {
      this.logger.warn('RESEND_API_KEY not set — email delivery is disabled')
    }
  }

  /** Send a task-assigned email */
  async sendTaskAssigned(opts: {
    to: string
    recipientName: string
    actorName: string
    taskTitle: string
    taskUrl: string
    workspaceName: string
  }) {
    return this.send({
      to: opts.to,
      subject: `[Rundesk] ${opts.actorName} assigned you "${opts.taskTitle}"`,
      html: this.layout({
        heading: 'You were assigned a task',
        body: `
          <p>Hi ${opts.recipientName},</p>
          <p><strong>${opts.actorName}</strong> assigned you the task
             <strong>${opts.taskTitle}</strong> in <em>${opts.workspaceName}</em>.</p>
        `,
        ctaUrl: opts.taskUrl,
        ctaLabel: 'Open task',
      }),
    })
  }

  /** Send a mention email */
  async sendMention(opts: {
    to: string
    recipientName: string
    actorName: string
    context: string           // "in a comment on …" or "in task description …"
    taskTitle: string
    taskUrl: string
    workspaceName: string
  }) {
    return this.send({
      to: opts.to,
      subject: `[Rundesk] ${opts.actorName} mentioned you ${opts.context}`,
      html: this.layout({
        heading: `${opts.actorName} mentioned you`,
        body: `
          <p>Hi ${opts.recipientName},</p>
          <p><strong>${opts.actorName}</strong> mentioned you ${opts.context} on
             <strong>${opts.taskTitle}</strong> in <em>${opts.workspaceName}</em>.</p>
        `,
        ctaUrl: opts.taskUrl,
        ctaLabel: 'View thread',
      }),
    })
  }

  /** Send a due-soon reminder */
  async sendDueSoon(opts: {
    to: string
    recipientName: string
    taskTitle: string
    taskUrl: string
    dueDateLabel: string      // e.g. "tomorrow" or "in 2 days"
    workspaceName: string
  }) {
    return this.send({
      to: opts.to,
      subject: `[Rundesk] Task due ${opts.dueDateLabel}: "${opts.taskTitle}"`,
      html: this.layout({
        heading: `Task due ${opts.dueDateLabel}`,
        body: `
          <p>Hi ${opts.recipientName},</p>
          <p>Your task <strong>${opts.taskTitle}</strong> in
             <em>${opts.workspaceName}</em> is due <strong>${opts.dueDateLabel}</strong>.</p>
        `,
        ctaUrl: opts.taskUrl,
        ctaLabel: 'View task',
      }),
    })
  }

  /** Send an overdue reminder */
  async sendOverdue(opts: {
    to: string
    recipientName: string
    taskTitle: string
    taskUrl: string
    workspaceName: string
  }) {
    return this.send({
      to: opts.to,
      subject: `[Rundesk] Overdue task: "${opts.taskTitle}"`,
      html: this.layout({
        heading: 'Overdue task',
        body: `
          <p>Hi ${opts.recipientName},</p>
          <p>Your task <strong>${opts.taskTitle}</strong> in
             <em>${opts.workspaceName}</em> is <strong>overdue</strong>.</p>
        `,
        ctaUrl: opts.taskUrl,
        ctaLabel: 'View task',
        alertColor: '#ef4444',
      }),
    })
  }

  /** Send a task-commented notification */
  async sendComment(opts: {
    to: string
    recipientName: string
    actorName: string
    taskTitle: string
    taskUrl: string
    commentSnippet: string
    workspaceName: string
  }) {
    return this.send({
      to: opts.to,
      subject: `[Rundesk] ${opts.actorName} commented on "${opts.taskTitle}"`,
      html: this.layout({
        heading: `New comment on "${opts.taskTitle}"`,
        body: `
          <p>Hi ${opts.recipientName},</p>
          <p><strong>${opts.actorName}</strong> commented on
             <strong>${opts.taskTitle}</strong> in <em>${opts.workspaceName}</em>:</p>
          <blockquote style="border-left:3px solid #6f96d1;margin:12px 0;padding:8px 16px;
                             color:#374151;background:#f3f7fd;border-radius:0 6px 6px 0;">
            ${opts.commentSnippet}
          </blockquote>
        `,
        ctaUrl: opts.taskUrl,
        ctaLabel: 'Reply',
      }),
    })
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async send(opts: { to: string; subject: string; html: string }) {
    if (!this.client) return   // silently no-op when key not configured

    try {
      await this.client.emails.send({
        from: this.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      })
    } catch (err) {
      // Never let email failures propagate — log and move on
      this.logger.error(`Failed to send email to ${opts.to}: ${(err as Error).message}`)
    }
  }

  private layout(opts: {
    heading: string
    body: string
    ctaUrl: string
    ctaLabel: string
    alertColor?: string
  }): string {
    const accentColor = opts.alertColor ?? '#354fb0'
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.heading}</title>
</head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:10px;overflow:hidden;
                    box-shadow:0 2px 8px rgba(0,0,0,.07);">
        <!-- Header -->
        <tr>
          <td style="background:${accentColor};padding:24px 32px;">
            <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
              Rundesk
            </span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0c215d;">
              ${opts.heading}
            </h2>
            <div style="font-size:14px;line-height:1.6;color:#374151;">
              ${opts.body}
            </div>
            <div style="margin-top:24px;">
              <a href="${opts.ctaUrl}"
                 style="display:inline-block;background:${accentColor};color:#fff;
                        font-size:14px;font-weight:600;padding:10px 22px;border-radius:6px;
                        text-decoration:none;">
                ${opts.ctaLabel}
              </a>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f3f7fd;border-top:1px solid #e5ecf7;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              You're receiving this because you're a member of a Rundesk workspace.
              Manage your notification preferences in your account settings.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  }
}
