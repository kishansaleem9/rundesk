import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import nodemailer, { type Transporter } from 'nodemailer'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private readonly transport: Transporter | null = null
  private readonly from: string
  private readonly nodeEnv: string

  constructor(private config: ConfigService) {
    this.nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development'
    const smtpHost = this.config.get<string>('SMTP_HOST')
    const smtpPort = Number(this.config.get<string>('SMTP_PORT') ?? 587)
    const smtpUser = this.config.get<string>('SMTP_USER')
    const smtpPass = this.config.get<string>('SMTP_PASS')
    const smtpSecure = (this.config.get<string>('SMTP_SECURE') ?? 'false').toLowerCase() === 'true'

    this.from = this.config.get<string>('SMTP_FROM') ?? this.config.get<string>('EMAIL_FROM') ?? 'noreply@rundesk.internal'
    if (smtpHost && smtpUser && smtpPass) {
      this.transport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      })
    } else {
      this.logger.warn('SMTP is not fully configured (SMTP_HOST/SMTP_USER/SMTP_PASS). Email delivery is disabled.')
    }
  }

  private esc(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]!)
  }

  /** Send an invitation email */
  async sendInvitationEmail(opts: {
    to: string
    inviter: string
    orgName: string
    claimUrl: string
    expiresAt: Date
  }) {
    const expiry = opts.expiresAt.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    return this.send({
      to: opts.to,
      subject: `[Rundesk] ${opts.inviter} invited you to join ${opts.orgName}`,
      html: this.layout({
        heading: 'You were invited to Rundesk',
        body: `
          <p>Hi there,</p>
          <p><strong>${this.esc(opts.inviter)}</strong> has invited you to collaborate on 
             <strong>${this.esc(opts.orgName)}</strong> using Rundesk.</p>
          <p style="font-size: 13px; color: #6b7280;">This invitation will expire on ${expiry}.</p>
        `,
        ctaUrl: opts.claimUrl,
        ctaLabel: 'Accept Invitation',
      }),
    })
  }

  /** Send a plain test email for provider verification */
  async sendTestEmail(opts: { to: string; subject?: string; html?: string }) {
    return this.send({
      to: opts.to,
      subject: opts.subject ?? 'Hello World',
      html:
        opts.html ??
        '<p>Congrats on sending your <strong>first email</strong>!</p>',
    })
  }

  /** Send a password reset email */
  async sendPasswordResetEmail(opts: {
    to: string
    recipientName?: string
    resetUrl: string
    expiresAt: Date
  }) {
    const expiry = opts.expiresAt.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    return this.send({
      to: opts.to,
      subject: '[Rundesk] Reset your password',
      html: this.layout({
        heading: 'Reset your password',
        body: `
          <p>Hi ${this.esc(opts.recipientName || 'there')},</p>
          <p>We received a request to reset your Rundesk password.</p>
          <p style="font-size: 13px; color: #6b7280;">This link will expire on ${expiry}.</p>
        `,
        ctaUrl: opts.resetUrl,
        ctaLabel: 'Reset password',
      }),
    })
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
          <p>Hi ${this.esc(opts.recipientName)},</p>
          <p><strong>${this.esc(opts.actorName)}</strong> assigned you the task
             <strong>${this.esc(opts.taskTitle)}</strong> in <em>${this.esc(opts.workspaceName)}</em>.</p>
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
        heading: `${this.esc(opts.actorName)} mentioned you`,
        body: `
          <p>Hi ${this.esc(opts.recipientName)},</p>
          <p><strong>${this.esc(opts.actorName)}</strong> mentioned you ${this.esc(opts.context)} on
             <strong>${this.esc(opts.taskTitle)}</strong> in <em>${this.esc(opts.workspaceName)}</em>.</p>
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
          <p>Hi ${this.esc(opts.recipientName)},</p>
          <p>Your task <strong>${this.esc(opts.taskTitle)}</strong> in
             <em>${this.esc(opts.workspaceName)}</em> is due <strong>${this.esc(opts.dueDateLabel)}</strong>.</p>
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
          <p>Hi ${this.esc(opts.recipientName)},</p>
          <p>Your task <strong>${this.esc(opts.taskTitle)}</strong> in
             <em>${this.esc(opts.workspaceName)}</em> is <strong>overdue</strong>.</p>
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
          <p>Hi ${this.esc(opts.recipientName)},</p>
          <p><strong>${this.esc(opts.actorName)}</strong> commented on
             <strong>${this.esc(opts.taskTitle)}</strong> in <em>${this.esc(opts.workspaceName)}</em>:</p>
          <blockquote style="border-left:3px solid #6f96d1;margin:12px 0;padding:8px 16px;
                             color:#374151;background:#f3f7fd;border-radius:0 6px 6px 0;">
            ${this.esc(opts.commentSnippet)}
          </blockquote>
        `,
        ctaUrl: opts.taskUrl,
        ctaLabel: 'Reply',
      }),
    })
  }

  /** Send a clip share notification */
  async sendClipSharedEmail(opts: {
    to: string
    actorEmail: string
    clipName: string
    clipUrl: string
    expiresAt: Date
  }) {
    return this.send({
      to: opts.to,
      subject: `[Rundesk] ${opts.actorEmail} shared a clip with you`,
      html: this.layout({
        heading: 'A clip was shared with you',
        body: `
          <p><strong>${this.esc(opts.actorEmail)}</strong> shared a clip with you:</p>
          <p><strong>${this.esc(opts.clipName)}</strong></p>
          <p style="font-size: 13px; color: #6b7280;">This secure link expires on ${opts.expiresAt.toLocaleString()}.</p>
        `,
        ctaUrl: opts.clipUrl,
        ctaLabel: 'Open clip',
      }),
    })
  }

  /** Send a generic activity notification email */
  async sendActivity(opts: {
    to: string
    recipientName: string
    actorName: string
    title: string
    body?: string
    taskUrl: string
    workspaceName: string
  }) {
    return this.send({
      to: opts.to,
      subject: `[Rundesk] ${opts.title}`,
      html: this.layout({
        heading: 'New activity',
        body: `
          <p>Hi ${this.esc(opts.recipientName)},</p>
          <p><strong>${this.esc(opts.actorName)}</strong> triggered a new activity in <em>${this.esc(opts.workspaceName)}</em>:</p>
          <p><strong>${this.esc(opts.title)}</strong></p>
          ${
            opts.body
              ? `<blockquote style="border-left:3px solid #6f96d1;margin:12px 0;padding:8px 16px;color:#374151;background:#f3f7fd;border-radius:0 6px 6px 0;">
                   ${this.esc(opts.body)}
                 </blockquote>`
              : ''
          }
        `,
        ctaUrl: opts.taskUrl,
        ctaLabel: 'Open in Rundesk',
      }),
    })
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async send(opts: { to: string; subject: string; html: string }) {
    if (!this.transport) {
      this.logger.log(`[DEV EMAIL] To: ${opts.to} | Subject: ${opts.subject}`)
      return
    }

    try {
      await this.transport.sendMail({
        from: this.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      })
      this.logger.log(`[EMAIL SENT] To: ${opts.to} | Subject: ${opts.subject}`)
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${opts.to}: ${(err as Error).message}`,
      )
      throw new InternalServerErrorException('Unable to send email right now')
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
