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
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const value = this.config.get<string>(key)
        if (typeof value === 'string' && value.trim().length > 0) return value.trim()
      }
      return undefined
    }

    this.nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development'
    const smtpHost = pick('SMTP_HOST', 'MAIL_HOST')
    const smtpPort = Number(pick('SMTP_PORT', 'MAIL_PORT') ?? 587)
    const smtpUser = pick('SMTP_USER', 'MAIL_USER', 'MAIL_EMAIL', 'MAIL_USERNAME')
    const smtpPass = pick('SMTP_PASS', 'MAIL_PASS', 'MAIL_PASSWORD')
    const smtpSecureRaw = (pick('SMTP_SECURE', 'MAIL_SECURE', 'MAIL_ENCRYPTION') ?? 'false').toLowerCase()
    const smtpSecure = smtpSecureRaw === 'true' || smtpSecureRaw === 'ssl' || smtpSecureRaw === 'tls'

    this.from = pick('SMTP_FROM', 'MAIL_FROM_ADDRESS', 'EMAIL_FROM') ?? 'noreply@rundesk.internal'
    if (smtpHost && smtpUser && smtpPass) {
      this.transport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      })
      this.logger.log(
        `SMTP configured (host=${smtpHost}, port=${smtpPort}, secure=${smtpSecure}, user=${smtpUser.slice(0, 2)}***).`,
      )
    } else {
      this.logger.warn(
        'SMTP is not fully configured. Provide SMTP_* keys or MAIL_* fallback keys (host/user/pass). Email delivery is disabled.',
      )
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

  /** Send an email-verification link */
  async sendVerificationEmail(opts: {
    to: string
    recipientName?: string
    verifyUrl: string
    expiresAt: Date
  }) {
    const expiry = opts.expiresAt.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    return this.send({
      to: opts.to,
      subject: '[Rundesk] Verify your email',
      html: this.layout({
        heading: 'Verify your email',
        body: `
          <p>Hi ${this.esc(opts.recipientName || 'there')},</p>
          <p>Confirm your email address to finish setting up your Rundesk account.</p>
          <p style="font-size: 13px; color: #6b7280;">This link will expire on ${expiry}.</p>
        `,
        ctaUrl: opts.verifyUrl,
        ctaLabel: 'Verify email',
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

  /** Send a task-comment-resolved notification */
  async sendCommentResolved(opts: {
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
      subject: `[Rundesk] ${opts.actorName} resolved your comment on "${opts.taskTitle}"`,
      html: this.layout({
        heading: `Comment resolved on "${opts.taskTitle}"`,
        body: `
          <p>Hi ${this.esc(opts.recipientName)},</p>
          <p><strong>${this.esc(opts.actorName)}</strong> marked your comment as resolved on
             <strong>${this.esc(opts.taskTitle)}</strong> in <em>${this.esc(opts.workspaceName)}</em>:</p>
          <blockquote style="border-left:3px solid #6f96d1;margin:12px 0;padding:8px 16px;
                             color:#374151;background:#f3f7fd;border-radius:0 6px 6px 0;">
            ${this.esc(opts.commentSnippet)}
          </blockquote>
        `,
        ctaUrl: opts.taskUrl,
        ctaLabel: 'View task',
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

  /** Send a periodic digest of unread notifications. */
  async sendDigest(opts: {
    to: string
    recipientName: string
    frequency: 'daily' | 'weekly'
    total: number
    groups: Array<{
      type: string
      count: number
      items: Array<{ title: string; body: string | null; url: string | null }>
    }>
    appUrl: string
  }) {
    const TYPE_LABELS: Record<string, string> = {
      task_assigned: 'Assignments',
      task_mentioned: 'Mentions',
      task_commented: 'Comments',
      task_due_soon: 'Due soon',
      task_overdue: 'Overdue',
      task_status_changed: 'Status changes',
      task_updated: 'Updates',
      chat_message: 'Chat',
      doc_mentioned: 'Doc mentions',
      doc_commented: 'Doc comments',
    }
    const sections = opts.groups
      .map((g) => {
        const label = TYPE_LABELS[g.type] ?? g.type
        const items = g.items
          .map((it) => {
            const title = this.esc(it.title)
            const linked = it.url ? `<a href="${this.esc(it.url)}" style="color:#354fb0;text-decoration:none;">${title}</a>` : title
            const body = it.body ? `<span style="color:#6b7280;"> — ${this.esc(it.body.slice(0, 120))}</span>` : ''
            return `<li style="margin:4px 0;">${linked}${body}</li>`
          })
          .join('')
        const more = g.count > g.items.length ? `<li style="color:#9ca3af;list-style:none;">+ ${g.count - g.items.length} more</li>` : ''
        return `<h3 style="margin:20px 0 6px;font-size:15px;color:#0c215d;">${this.esc(label)} (${g.count})</h3>
          <ul style="margin:0;padding-left:18px;font-size:14px;">${items}${more}</ul>`
      })
      .join('')

    return this.send({
      to: opts.to,
      subject: `[Rundesk] Your ${opts.frequency} digest — ${opts.total} update${opts.total === 1 ? '' : 's'}`,
      html: this.layout({
        heading: `You have ${opts.total} unread notification${opts.total === 1 ? '' : 's'}`,
        body: `<p>Hi ${this.esc(opts.recipientName)},</p>
          <p>Here's what happened while you were away:</p>
          ${sections}`,
        ctaUrl: opts.appUrl,
        ctaLabel: 'Open Rundesk',
      }),
    })
  }

  /**
   * Send a scheduled custom report (§9.5): a compact HTML summary table of the
   * top rows plus the full result as a CSV attachment. `columns[0]` is the group
   * column; the rest are metric columns already resolved to their display labels.
   */
  async sendScheduledReport(opts: {
    to: string
    reportName: string
    frequency: 'daily' | 'weekly'
    groupLabel: string
    columns: string[]
    rows: Array<Array<string | number>>
    totalRows: number
    generatedAt: string
    csv: string
    appUrl: string
  }) {
    const cadence = opts.frequency === 'weekly' ? 'weekly' : 'daily'
    const generated = new Date(opts.generatedAt)
    const generatedLabel = Number.isNaN(generated.getTime())
      ? opts.generatedAt
      : `${generated.toISOString().slice(0, 16).replace('T', ' ')} UTC`

    const header = opts.columns.map((c) => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5ecf7;font-size:12px;color:#0c215d;text-transform:uppercase;letter-spacing:.03em;">${this.esc(c)}</th>`).join('')
    const preview = opts.rows.slice(0, 20)
    const bodyRows = preview
      .map((r, ri) => {
        const cells = r
          .map((c, ci) =>
            `<td style="padding:6px 10px;border-bottom:1px solid #eef2f9;font-size:13px;color:#374151;${ci === 0 ? '' : 'text-align:right;font-variant-numeric:tabular-nums;'}">${this.esc(String(c ?? ''))}</td>`,
          )
          .join('')
        return `<tr style="background:${ri % 2 ? '#f9fbfe' : '#ffffff'};">${cells}</tr>`
      })
      .join('')
    const moreNote =
      opts.totalRows > preview.length
        ? `<p style="font-size:12px;color:#9ca3af;margin:10px 0 0;">+ ${opts.totalRows - preview.length} more row${opts.totalRows - preview.length === 1 ? '' : 's'} in the attached CSV.</p>`
        : ''
    const table = preview.length
      ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:8px;">
           <thead><tr>${header}</tr></thead>
           <tbody>${bodyRows}</tbody>
         </table>${moreNote}`
      : `<p style="font-size:13px;color:#6b7280;">This report returned no rows for the selected period.</p>`

    return this.send({
      to: opts.to,
      subject: `[Rundesk] ${cadence === 'weekly' ? 'Weekly' : 'Daily'} report: ${opts.reportName}`,
      html: this.layout({
        heading: this.esc(opts.reportName),
        body: `
          <p>Here is your ${this.esc(cadence)} report, grouped by <strong>${this.esc(opts.groupLabel)}</strong>.</p>
          <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">Generated ${this.esc(generatedLabel)}</p>
          ${table}
        `,
        ctaUrl: opts.appUrl,
        ctaLabel: 'Open in Rundesk',
      }),
      attachments: [
        {
          filename: `${(opts.reportName || 'report').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.csv`,
          content: opts.csv,
          contentType: 'text/csv; charset=utf-8',
        },
      ],
    })
  }

  /**
   * Send a paid-invoice receipt (§14.1) with the branded PDF invoice attached.
   * Falls back to the dev-log path when SMTP is unconfigured, like every other
   * email. Delivery is app-side (in addition to Stripe's own emails); the
   * BillingService webhook guards against emailing the same invoice twice.
   */
  async sendInvoicePaid(opts: {
    to: string
    workspaceName: string
    invoiceNumber: string
    amountLabel: string
    statusLabel: string
    dateLabel: string
    manageUrl: string
    pdf: Buffer
  }) {
    return this.send({
      to: opts.to,
      subject: `[Rundesk] Invoice ${opts.invoiceNumber} — ${opts.amountLabel}`,
      html: this.layout({
        heading: `Your Rundesk invoice (${opts.amountLabel})`,
        body: `
          <p>Hi there,</p>
          <p>Thanks for your subscription to <strong>${this.esc(opts.workspaceName)}</strong>.
             Your invoice <strong>${this.esc(opts.invoiceNumber)}</strong> is attached as a PDF.</p>
          <table cellpadding="0" cellspacing="0" style="margin:12px 0;font-size:14px;color:#374151;">
            <tr><td style="padding:2px 16px 2px 0;color:#6b7280;">Amount</td><td style="padding:2px 0;"><strong>${this.esc(opts.amountLabel)}</strong></td></tr>
            <tr><td style="padding:2px 16px 2px 0;color:#6b7280;">Status</td><td style="padding:2px 0;">${this.esc(opts.statusLabel)}</td></tr>
            <tr><td style="padding:2px 16px 2px 0;color:#6b7280;">Date</td><td style="padding:2px 0;">${this.esc(opts.dateLabel)}</td></tr>
          </table>
        `,
        ctaUrl: opts.manageUrl,
        ctaLabel: 'View billing',
      }),
      attachments: [
        {
          filename: `invoice-${(opts.invoiceNumber || 'rundesk').replace(/[^a-z0-9-_]+/gi, '-')}.pdf`,
          content: opts.pdf,
          contentType: 'application/pdf',
        },
      ],
    })
  }

  private async send(opts: {
    to: string
    subject: string
    html: string
    attachments?: Array<{ filename: string; content: string | Buffer; contentType?: string }>
  }) {
    if (!this.transport) {
      const attach = opts.attachments?.length ? ` | Attachments: ${opts.attachments.map((a) => a.filename).join(', ')}` : ''
      this.logger.log(`[DEV EMAIL] To: ${opts.to} | Subject: ${opts.subject}${attach}`)
      return
    }

    try {
      await this.transport.sendMail({
        from: this.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        attachments: opts.attachments,
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
