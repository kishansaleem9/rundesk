import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { emailAccountSenders, emailAccounts, emailSignatures, emailTemplates, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { FLAGS } from '@rundesk/feature-flags'
import { DB_TOKEN } from '../../common/database/database.module'
import { isAdminRole } from '../../common/permissions/workspace-roles'
import { isUuid } from '../../common/validation/uuid'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import { EMAIL_ACCOUNT_REFUSALS, IntegrationConnectionsService } from '../integrations/connections/integration-connections.service'
import { PlansService } from '../plans/plans.service'
import { EMAIL_PLANS, EMAIL_PLAN_REFUSALS, type EmailPlan } from './email-plan'
import type { OutgoingMail } from './mail-message'
import { draftInMailbox, MailboxRefused, readMailboxThread, refreshMailboxGrant, sendFromMailbox, type SentMail, type ThreadMessage } from './mailbox.client'

type Actor = { id: string; role?: string | null }
type AccountRow = typeof emailAccounts.$inferSelect


/** The words of what the Email settings refuse. */
export const EMAIL_ACCOUNTS_REFUSALS = {
  off: 'Email is off in this workspace: an owner or admin turns it on in Settings → ClickApps',
  notFound: 'That email account is not in this workspace',
  notYours: 'Only whoever linked this email account changes it',
  mayNotRemove: 'Only whoever linked this email account, or an owner or admin, removes it',
  mayNotSend: 'You may not send from this email account: whoever linked it chooses who may',
  needsReconnect: 'This email account has to be linked again before it sends',
  senderName: 'A sender name is 1 to 120 characters',
  notMembers: 'Only members of this workspace, not guests, may be let send from an email account',
  signatureName: 'A signature needs a name of 1 to 80 characters',
  signatureBody: 'A signature needs words, 10,000 characters at most',
  templateName: 'A template needs a name of 1 to 120 characters',
  templateBody: 'A template needs words, 50,000 characters at most',
  templateSubject: 'A template subject is 255 characters at most',
  notYourTemplate: 'Only whoever made this template, or an owner or admin, changes it',
  signatureNotFound: 'That signature is not yours',
  templateNotFound: 'That template is not one you may use',
  notYourDrafts: 'A draft is written only in a mailbox you linked yourself',
  draftNeedsRelink: (address: string) => `${address} was linked before Rundesk asked to write drafts in it: link it again in Email settings`,
} as const

/**
 * MAY RUNDESK WRITE DRAFTS IN THIS MAILBOX? Gmail's `drafts.create` wants
 * `gmail.compose` (or a scope that holds it), which a mailbox linked only to send
 * and read was not asked for; Graph makes a draft with `Mail.ReadWrite`.
 */
export function mayDraftIn(a: { provider: string; scopes: string[] | null }): boolean {
  const scopes = (a.scopes ?? []).map((x) => x.toLowerCase())
  if (a.provider === 'gmail') {
    return scopes.some((x) => x === 'https://mail.google.com/' || x.endsWith('/gmail.compose') || x.endsWith('/gmail.modify'))
  }
  return scopes.some((x) => x === 'mail.readwrite' || x.endsWith('/mail.readwrite'))
}

export type EmailAccountView = {
  id: string
  provider: 'gmail' | 'outlook'
  address: string
  senderName: string
  status: 'connected' | 'needs_reconnect'
  lastError: string | null
  uses: number
  usesLeft: number | null
  owner: { id: string; name: string }
  /** Theirs: they name it, share it and remove it. */
  mine: boolean
  /** May send from it: theirs, or shared with them. */
  maySend: boolean
  mayRemove: boolean
  /** Who besides its owner may send from it — told to its owner and admins alone. */
  senders: string[] | null
}

/**
 * THE MAILBOXES A WORKSPACE'S PEOPLE LINKED, AND WHAT THEY KEEP FOR EMAIL
 * (`found-9-oct/task-email-sends-from-the-server`).
 *
 * ClickUp's Email settings: the email accounts — linked from the comment box
 * or here, each under a sender name, each sendable from by whoever linked it
 * and the teammates they choose — and, on Business and above, a person's
 * signatures and the workspace's templates. The ClickApp must be on, and
 * guests have none of it, as the comment box's Email.
 */
@Injectable()
export class EmailAccountsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly plans: PlansService,
    private readonly flags: FeatureFlagsService,
    private readonly connections: IntegrationConnectionsService,
  ) {}

  /** A member, not a guest, with the ClickApp on; and what their plan gives. */
  async gate(workspaceId: string, actor: Actor): Promise<{ role: string; planLabel: string; planId: keyof typeof EMAIL_PLANS; email: EmailPlan }> {
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
      .limit(1)
    if (!member) throw new ForbiddenException('You are not a member of this workspace')
    if (member.role === 'guest') throw new ForbiddenException(EMAIL_ACCOUNT_REFUSALS.guest)
    const on = await this.flags.isEnabled(FLAGS.TASK_EMAIL, { workspaceId, userId: actor.id, role: actor.role ?? '' })
    if (!on) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.off)
    const plan = await this.plans.getWorkspacePlan(workspaceId)
    return { role: member.role, planLabel: plan.label, planId: plan.id, email: EMAIL_PLANS[plan.id] }
  }

  /** Which mailboxes this server can link: each provider's application, the owner's to register. */
  providers() {
    const has = (...keys: string[]) => keys.every((k) => !!process.env[k])
    const say = (ok: boolean, keys: string) => (ok ? { available: true } : { available: false, reason: `Not set up on this server — missing ${keys}` })
    return {
      gmail: say(has('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'), 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET'),
      outlook: say(has('MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'), 'MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET'),
    }
  }

  private async accountsVisibleTo(workspaceId: string, actor: Actor, role: string, plan: EmailPlan): Promise<EmailAccountView[]> {
    const admin = isAdminRole(role)
    const granted = this.db.select({ id: emailAccountSenders.accountId }).from(emailAccountSenders).where(eq(emailAccountSenders.userId, actor.id))
    const rows = await this.db
      .select({ a: emailAccounts, ownerName: users.displayName, ownerEmail: users.email })
      .from(emailAccounts)
      .innerJoin(users, eq(users.id, emailAccounts.ownerId))
      .where(
        and(
          eq(emailAccounts.workspaceId, workspaceId),
          admin ? sql`true` : or(eq(emailAccounts.ownerId, actor.id), inArray(emailAccounts.id, granted)),
        ),
      )
      .orderBy(asc(emailAccounts.createdAt))
    const ids = rows.map((r) => r.a.id)
    const senders = ids.length
      ? await this.db.select({ accountId: emailAccountSenders.accountId, userId: emailAccountSenders.userId }).from(emailAccountSenders).where(inArray(emailAccountSenders.accountId, ids))
      : []
    return rows.map(({ a, ownerName, ownerEmail }) => {
      const mine = a.ownerId === actor.id
      const its = senders.filter((s) => s.accountId === a.id).map((s) => s.userId)
      return {
        id: a.id,
        provider: a.provider as 'gmail' | 'outlook',
        address: a.address,
        senderName: a.senderName,
        status: a.status as 'connected' | 'needs_reconnect',
        lastError: a.lastError,
        uses: a.uses,
        usesLeft: plan.uses === null ? null : Math.max(0, plan.uses - a.uses),
        owner: { id: a.ownerId, name: (ownerName ?? '').trim() || (ownerEmail ?? '').split('@')[0] },
        mine,
        maySend: mine || its.includes(actor.id),
        mayRemove: mine || admin,
        senders: mine || admin ? its : null,
      }
    })
  }

  /** The Email settings: the mailboxes, the signatures, the templates, and what the plan gives. */
  async overview(workspaceId: string, actor: Actor) {
    const { role, planLabel, planId, email } = await this.gate(workspaceId, actor)
    const accounts = await this.accountsVisibleTo(workspaceId, actor, role, email)
    const members = await this.db
      .select({ id: users.id, name: users.displayName, email: users.email, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
    return {
      plan: { id: planId, label: planLabel, ...email },
      providers: this.providers(),
      accounts,
      signatures: email.signaturesAndTemplates ? await this.signaturesOf(workspaceId, actor.id) : [],
      templates: email.signaturesAndTemplates ? await this.templatesFor(workspaceId, actor.id) : [],
      members: members.filter((m) => m.role !== 'guest').map((m) => ({ id: m.id, name: (m.name ?? '').trim() || (m.email ?? '').split('@')[0], email: m.email })),
    }
  }

  /** The provider's consent page, for a mailbox of this person's own. */
  async connect(workspaceId: string, actor: Actor, provider: string) {
    await this.gate(workspaceId, actor)
    return this.connections.getOAuthStartUrl(workspaceId, actor.id, provider, { email: true })
  }

  private async accountIn(workspaceId: string, accountId: string): Promise<AccountRow> {
    if (!isUuid(accountId)) throw new NotFoundException(EMAIL_ACCOUNTS_REFUSALS.notFound)
    const [a] = await this.db.select().from(emailAccounts).where(and(eq(emailAccounts.id, accountId), eq(emailAccounts.workspaceId, workspaceId))).limit(1)
    if (!a) throw new NotFoundException(EMAIL_ACCOUNTS_REFUSALS.notFound)
    return a
  }

  /** Its sender name, and who besides its owner may send from it: the owner's to choose. */
  async updateAccount(workspaceId: string, accountId: string, actor: Actor, input: { senderName?: unknown; senders?: unknown }) {
    const { role, email } = await this.gate(workspaceId, actor)
    const a = await this.accountIn(workspaceId, accountId)
    if (a.ownerId !== actor.id) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.notYours)
    if (input.senderName !== undefined) {
      const name = typeof input.senderName === 'string' ? input.senderName.replace(/[\r\n"<>]+/g, ' ').trim() : ''
      if (!name || name.length > 120) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.senderName)
      await this.db.update(emailAccounts).set({ senderName: name, updatedAt: new Date() }).where(eq(emailAccounts.id, a.id))
    }
    if (input.senders !== undefined) {
      const ids = Array.isArray(input.senders) ? [...new Set(input.senders.filter((x): x is string => typeof x === 'string'))] : null
      if (!ids || ids.some((id) => !isUuid(id))) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.notMembers)
      const others = ids.filter((id) => id !== a.ownerId)
      if (others.length) {
        const ok = await this.db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, others), sql`${workspaceMembers.role} <> 'guest'`))
        if (ok.length !== others.length) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.notMembers)
      }
      await this.db.transaction(async (tx) => {
        await tx.delete(emailAccountSenders).where(eq(emailAccountSenders.accountId, a.id))
        if (others.length) await tx.insert(emailAccountSenders).values(others.map((userId) => ({ accountId: a.id, userId })))
      })
    }
    return (await this.accountsVisibleTo(workspaceId, actor, role, email)).find((x) => x.id === a.id)
  }

  /** Removed by whoever linked it, or an owner or admin; what was sent from it stays in its tasks. */
  async removeAccount(workspaceId: string, accountId: string, actor: Actor) {
    const { role } = await this.gate(workspaceId, actor)
    const a = await this.accountIn(workspaceId, accountId)
    if (a.ownerId !== actor.id && !isAdminRole(role)) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.mayNotRemove)
    await this.db.delete(emailAccounts).where(eq(emailAccounts.id, a.id))
    return { id: a.id, removed: true }
  }

  /** The mailboxes this person may send from, for the composer's From. */
  async sendable(workspaceId: string, actor: Actor): Promise<EmailAccountView[]> {
    const { role, email } = await this.gate(workspaceId, actor)
    return (await this.accountsVisibleTo(workspaceId, actor, role, email)).filter((a) => a.maySend)
  }

  /** A grant that works now: refreshed when it is about to lapse; a refusal marks the mailbox for linking again. */
  private async grantOf(a: AccountRow): Promise<{ provider: 'gmail' | 'outlook'; accessToken: string }> {
    const provider = a.provider as 'gmail' | 'outlook'
    if (a.status !== 'connected' || !a.accessToken) throw new ConflictException(`${EMAIL_ACCOUNTS_REFUSALS.needsReconnect}${a.lastError ? ` — ${a.lastError}` : ''}`)
    const due = a.tokenExpiresAt && a.tokenExpiresAt.getTime() - Date.now() < 60_000
    if (!due || !a.refreshToken) return { provider, accessToken: a.accessToken }
    try {
      const fresh = await refreshMailboxGrant(provider, a.refreshToken)
      await this.db.update(emailAccounts).set({ accessToken: fresh.accessToken, tokenExpiresAt: fresh.expiresAt, updatedAt: new Date() }).where(eq(emailAccounts.id, a.id))
      return { provider, accessToken: fresh.accessToken }
    } catch (err) {
      if (err instanceof MailboxRefused) await this.markRefused(a.id, err)
      throw err
    }
  }

  private async markRefused(accountId: string, err: MailboxRefused) {
    if (!err.reconnect) return
    await this.db.update(emailAccounts).set({ status: 'needs_reconnect', lastError: err.said.slice(0, 300), updatedAt: new Date() }).where(eq(emailAccounts.id, accountId))
  }

  /**
   * SEND, AS THE MAILBOX, FOR THIS PERSON: its owner or a teammate it is
   * shared with; a Free plan's mailbox while it has uses — one taken before it
   * sends, and given back when the mailbox refused. A grant the provider
   * refused marks the mailbox to link again, and says so.
   */
  async sendAs(
    workspaceId: string,
    accountId: string,
    actor: Actor,
    mail: Omit<OutgoingMail, 'fromName' | 'fromAddress'>,
    answering?: { threadId: string; providerMessageId: string | null; internetMessageId: string | null } | null,
  ): Promise<{ account: { id: string; address: string; senderName: string }; sent: SentMail }> {
    const { planLabel, email } = await this.gate(workspaceId, actor)
    const a = await this.accountIn(workspaceId, accountId)
    if (a.ownerId !== actor.id) {
      const [granted] = await this.db
        .select({ userId: emailAccountSenders.userId })
        .from(emailAccountSenders)
        .where(and(eq(emailAccountSenders.accountId, a.id), eq(emailAccountSenders.userId, actor.id)))
        .limit(1)
      if (!granted) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.mayNotSend)
    }
    const grant = await this.grantOf(a)
    // One use taken before it goes, only while one is left: the test and the take are one statement.
    const [taken] = await this.db
      .update(emailAccounts)
      .set({ uses: sql`${emailAccounts.uses} + 1` })
      .where(and(eq(emailAccounts.id, a.id), email.uses === null ? sql`true` : sql`${emailAccounts.uses} < ${email.uses}`))
      .returning({ uses: emailAccounts.uses })
    if (!taken) throw new ForbiddenException(EMAIL_PLAN_REFUSALS.uses(planLabel, email.uses ?? 0))
    try {
      const sent = await sendFromMailbox(grant, { ...mail, fromName: a.senderName, fromAddress: a.address }, answering)
      return { account: { id: a.id, address: a.address, senderName: a.senderName }, sent }
    } catch (err) {
      await this.db.update(emailAccounts).set({ uses: sql`greatest(${emailAccounts.uses} - 1, 0)` }).where(eq(emailAccounts.id, a.id))
      if (err instanceof MailboxRefused) {
        await this.markRefused(a.id, err)
        throw new BadGatewayException(err.said)
      }
      throw err
    }
  }

  /**
   * THE MAILBOX THE AI WRITES THIS PERSON'S DRAFTS IN (`ledger-rows/row-2294`):
   * the first one they linked themselves that is connected — never a teammate's
   * shared with them, whose Drafts are not theirs to read. Null, with why, when
   * there is none they may use: Email off, a guest, or none linked.
   */
  async ownMailbox(workspaceId: string, actor: Actor): Promise<{ mailbox: { id: string; provider: 'gmail' | 'outlook'; address: string } | null; refusal: string | null }> {
    try {
      await this.gate(workspaceId, actor)
    } catch (err) {
      if (err instanceof ForbiddenException) return { mailbox: null, refusal: err.message }
      throw err
    }
    const [a] = await this.db
      .select({ id: emailAccounts.id, provider: emailAccounts.provider, address: emailAccounts.address })
      .from(emailAccounts)
      .where(and(eq(emailAccounts.workspaceId, workspaceId), eq(emailAccounts.ownerId, actor.id), eq(emailAccounts.status, 'connected')))
      .orderBy(asc(emailAccounts.createdAt))
      .limit(1)
    return { mailbox: a ? { id: a.id, provider: a.provider as 'gmail' | 'outlook', address: a.address } : null, refusal: null }
  }

  /**
   * A DRAFT, WRITTEN IN THIS PERSON'S OWN MAILBOX AND LEFT THERE
   * (`ledger-rows/row-2294`): for them to read, change and send from their own
   * Drafts. Theirs alone — a mailbox shared with them sends for them, but its
   * Drafts are its owner's. Nothing is sent, so no use is taken. A grant the
   * provider refused marks the mailbox to link again, as a send does.
   */
  async draftAs(
    workspaceId: string,
    accountId: string,
    actor: Actor,
    mail: { to: string[]; cc: string[]; subject: string; text: string },
  ): Promise<{ account: { id: string; address: string; provider: 'gmail' | 'outlook' }; draft: { id: string; messageId: string } }> {
    await this.gate(workspaceId, actor)
    const a = await this.accountIn(workspaceId, accountId)
    if (a.ownerId !== actor.id) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.notYourDrafts)
    if (!mayDraftIn(a)) throw new ConflictException(EMAIL_ACCOUNTS_REFUSALS.draftNeedsRelink(a.address))
    const grant = await this.grantOf(a)
    try {
      const draft = await draftInMailbox(grant, { ...mail, bcc: [], attachments: [], fromName: a.senderName, fromAddress: a.address })
      return { account: { id: a.id, address: a.address, provider: a.provider as 'gmail' | 'outlook' }, draft }
    } catch (err) {
      if (err instanceof MailboxRefused) {
        await this.markRefused(a.id, err)
        throw new BadGatewayException(err.said)
      }
      throw err
    }
  }

  /** A thread's messages, read from the mailbox it was sent from; null when the mailbox cannot be read now. */
  async readThread(accountId: string, threadId: string): Promise<{ account: AccountRow; messages: ThreadMessage[] } | null> {
    const [a] = await this.db.select().from(emailAccounts).where(eq(emailAccounts.id, accountId)).limit(1)
    if (!a || a.status !== 'connected') return null
    try {
      const grant = await this.grantOf(a)
      return { account: a, messages: await readMailboxThread(grant, threadId) }
    } catch (err) {
      if (err instanceof MailboxRefused) await this.markRefused(a.id, err)
      return null
    }
  }

  // ── signatures: a person's own, Business and above ─────────────────────────

  private async signaturesOf(workspaceId: string, userId: string) {
    return this.db
      .select({ id: emailSignatures.id, name: emailSignatures.name, body: emailSignatures.body, isDefault: emailSignatures.isDefault })
      .from(emailSignatures)
      .where(and(eq(emailSignatures.workspaceId, workspaceId), eq(emailSignatures.userId, userId)))
      .orderBy(asc(emailSignatures.createdAt))
  }

  private assertSignaturesAndTemplates(planLabel: string, email: EmailPlan) {
    if (!email.signaturesAndTemplates) throw new ForbiddenException(EMAIL_PLAN_REFUSALS.signaturesAndTemplates(planLabel))
  }

  private checkSignature(input: { name?: unknown; body?: unknown }, partial: boolean) {
    const out: { name?: string; body?: string } = {}
    if (!partial || input.name !== undefined) {
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      if (!name || name.length > 80) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.signatureName)
      out.name = name
    }
    if (!partial || input.body !== undefined) {
      const body = typeof input.body === 'string' ? input.body.replace(/\r\n/g, '\n').trimEnd() : ''
      if (!body.trim() || body.length > 10_000) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.signatureBody)
      out.body = body
    }
    return out
  }

  /** A signature; made the default, it is the only one. */
  async saveSignature(workspaceId: string, actor: Actor, signatureId: string | null, input: { name?: unknown; body?: unknown; isDefault?: unknown }) {
    const { planLabel, email } = await this.gate(workspaceId, actor)
    this.assertSignaturesAndTemplates(planLabel, email)
    const fields = this.checkSignature(input, signatureId !== null)
    const makeDefault = input.isDefault === true
    return this.db.transaction(async (tx) => {
      if (signatureId !== null) {
        if (!isUuid(signatureId)) throw new NotFoundException(EMAIL_ACCOUNTS_REFUSALS.signatureNotFound)
        const [mine] = await tx
          .select({ id: emailSignatures.id })
          .from(emailSignatures)
          .where(and(eq(emailSignatures.id, signatureId), eq(emailSignatures.workspaceId, workspaceId), eq(emailSignatures.userId, actor.id)))
          .limit(1)
        if (!mine) throw new NotFoundException(EMAIL_ACCOUNTS_REFUSALS.signatureNotFound)
      }
      if (makeDefault) {
        await tx.update(emailSignatures).set({ isDefault: false }).where(and(eq(emailSignatures.workspaceId, workspaceId), eq(emailSignatures.userId, actor.id)))
      }
      const flag = input.isDefault === undefined ? {} : { isDefault: makeDefault }
      if (signatureId === null) {
        const [row] = await tx.insert(emailSignatures).values({ workspaceId, userId: actor.id, name: fields.name!, body: fields.body!, ...flag }).returning()
        return row
      }
      const [row] = await tx.update(emailSignatures).set({ ...fields, ...flag, updatedAt: new Date() }).where(eq(emailSignatures.id, signatureId)).returning()
      return row
    })
  }

  async deleteSignature(workspaceId: string, actor: Actor, signatureId: string) {
    const { planLabel, email } = await this.gate(workspaceId, actor)
    this.assertSignaturesAndTemplates(planLabel, email)
    if (!isUuid(signatureId)) throw new NotFoundException(EMAIL_ACCOUNTS_REFUSALS.signatureNotFound)
    const gone = await this.db
      .delete(emailSignatures)
      .where(and(eq(emailSignatures.id, signatureId), eq(emailSignatures.workspaceId, workspaceId), eq(emailSignatures.userId, actor.id)))
      .returning({ id: emailSignatures.id })
    if (!gone.length) throw new NotFoundException(EMAIL_ACCOUNTS_REFUSALS.signatureNotFound)
    return { id: signatureId, deleted: true }
  }

  // ── templates: their maker's, or everybody's, Business and above ───────────

  private async templatesFor(workspaceId: string, userId: string) {
    const rows = await this.db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        body: emailTemplates.body,
        shared: emailTemplates.shared,
        createdById: emailTemplates.createdById,
      })
      .from(emailTemplates)
      .where(and(eq(emailTemplates.workspaceId, workspaceId), or(eq(emailTemplates.createdById, userId), eq(emailTemplates.shared, true))))
      .orderBy(asc(emailTemplates.name))
    return rows.map((r) => ({ ...r, mine: r.createdById === userId }))
  }

  private checkTemplate(input: { name?: unknown; subject?: unknown; body?: unknown; shared?: unknown }, partial: boolean) {
    const out: { name?: string; subject?: string | null; body?: string; shared?: boolean } = {}
    if (!partial || input.name !== undefined) {
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      if (!name || name.length > 120) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.templateName)
      out.name = name
    }
    if (input.subject !== undefined) {
      const subject = typeof input.subject === 'string' ? input.subject.replace(/[\r\n\t]+/g, ' ').trim() : ''
      if (subject.length > 255) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.templateSubject)
      out.subject = subject || null
    }
    if (!partial || input.body !== undefined) {
      const body = typeof input.body === 'string' ? input.body.replace(/\r\n/g, '\n') : ''
      if (!body.trim() || body.length > 50_000) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.templateBody)
      out.body = body
    }
    if (input.shared !== undefined) out.shared = input.shared === true
    return out
  }

  async saveTemplate(workspaceId: string, actor: Actor, templateId: string | null, input: { name?: unknown; subject?: unknown; body?: unknown; shared?: unknown }) {
    const { role, planLabel, email } = await this.gate(workspaceId, actor)
    this.assertSignaturesAndTemplates(planLabel, email)
    const fields = this.checkTemplate(input, templateId !== null)
    if (templateId === null) {
      const [row] = await this.db
        .insert(emailTemplates)
        .values({ workspaceId, createdById: actor.id, name: fields.name!, subject: fields.subject ?? null, body: fields.body!, shared: fields.shared ?? false })
        .returning()
      return { ...row, mine: true }
    }
    const t = await this.templateIn(workspaceId, templateId)
    if (t.createdById !== actor.id && !isAdminRole(role)) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.notYourTemplate)
    const [row] = await this.db.update(emailTemplates).set({ ...fields, updatedAt: new Date() }).where(eq(emailTemplates.id, t.id)).returning()
    return { ...row, mine: row.createdById === actor.id }
  }

  async deleteTemplate(workspaceId: string, actor: Actor, templateId: string) {
    const { role, planLabel, email } = await this.gate(workspaceId, actor)
    this.assertSignaturesAndTemplates(planLabel, email)
    const t = await this.templateIn(workspaceId, templateId)
    if (t.createdById !== actor.id && !isAdminRole(role)) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.notYourTemplate)
    await this.db.delete(emailTemplates).where(eq(emailTemplates.id, t.id))
    return { id: t.id, deleted: true }
  }

  private async templateIn(workspaceId: string, templateId: string) {
    if (!isUuid(templateId)) throw new NotFoundException(EMAIL_ACCOUNTS_REFUSALS.templateNotFound)
    const [t] = await this.db.select().from(emailTemplates).where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.workspaceId, workspaceId))).limit(1)
    if (!t) throw new NotFoundException(EMAIL_ACCOUNTS_REFUSALS.templateNotFound)
    return t
  }

  /** What the composer offers this person: their mailboxes, signatures and templates, and what the plan gives. */
  async composerSetup(workspaceId: string, actor: Actor) {
    const { role, planLabel, planId, email } = await this.gate(workspaceId, actor)
    const accounts = (await this.accountsVisibleTo(workspaceId, actor, role, email)).filter((a) => a.maySend)
    return {
      plan: { id: planId, label: planLabel, ...email },
      providers: this.providers(),
      accounts,
      signatures: email.signaturesAndTemplates ? await this.signaturesOf(workspaceId, actor.id) : [],
      templates: email.signaturesAndTemplates ? await this.templatesFor(workspaceId, actor.id) : [],
    }
  }
}
