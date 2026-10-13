import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { emailAccountSenders, emailAccounts, emailSignatures, emailTemplates, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { FLAGS } from '@rundesk/feature-flags'
import { DB_TOKEN } from '../../common/database/database.module'
import { isAdminRole } from '../../common/permissions/workspace-roles'
import { open as openSecret, seal, secretBoxReadiness } from '../../common/security/secret-box'
import { isUuid } from '../../common/validation/uuid'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import { EMAIL_ACCOUNT_REFUSALS, IntegrationConnectionsService } from '../integrations/connections/integration-connections.service'
import { PlansService } from '../plans/plans.service'
import { SecurityService } from '../security/security.service'
import { EMAIL_PLANS, EMAIL_PLAN_REFUSALS, type EmailPlan } from './email-plan'
import { draftInImap, readImapThreads, sendFromImap, verifyImapMailbox, type ImapGrant } from './imap-mailbox'
import type { OutgoingMail } from './mail-message'
import { mailHostOf, mailPortOf } from './mail-server'
import { draftInMailbox, MailboxRefused, readMailboxThread, refreshMailboxGrant, sendFromMailbox, type MailboxGrant, type SentMail, type ThreadMessage } from './mailbox.client'

type Actor = { id: string; role?: string | null }
type AccountRow = typeof emailAccounts.$inferSelect
type Provider = 'gmail' | 'outlook' | 'imap'
/** What a mailbox is signed in with: the provider's token, or an IMAP mailbox's servers and password. */
type Grant = MailboxGrant | ImapGrant

/** What a sealed IMAP password is bound to: its own row, so it opens nowhere else. */
const passwordContext = (accountId: string) => `email_accounts.password:${accountId}`


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
  imapAddress: 'An email address is needed, as name@domain',
  imapPassword: 'A password is needed, 1,000 characters at most',
  imapHost: (which: 'IMAP' | 'SMTP') => `The ${which} server is a name such as ${which.toLowerCase()}.example.com, or an address`,
  imapPort: (which: 'IMAP' | 'SMTP') => `The ${which} port is a whole number from 1 to 65535`,
  imapSsl: 'Say whether the servers require SSL',
  imapUnreadable: 'The password kept for this mailbox no longer opens on this server: link it again',
} as const

/**
 * MAY RUNDESK WRITE DRAFTS IN THIS MAILBOX? Gmail's `drafts.create` wants
 * `gmail.compose` (or a scope that holds it), which a mailbox linked only to send
 * and read was not asked for; Graph makes a draft with `Mail.ReadWrite`.
 */
export function mayDraftIn(a: { provider: string; scopes: string[] | null }): boolean {
  // A mailbox signed in to with its password may leave a message in any of its folders.
  if (a.provider === 'imap') return true
  const scopes = (a.scopes ?? []).map((x) => x.toLowerCase())
  if (a.provider === 'gmail') {
    return scopes.some((x) => x === 'https://mail.google.com/' || x.endsWith('/gmail.compose') || x.endsWith('/gmail.modify'))
  }
  return scopes.some((x) => x === 'mail.readwrite' || x.endsWith('/mail.readwrite'))
}

export type EmailAccountView = {
  id: string
  provider: Provider
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
  /** An IMAP mailbox's servers, told to its owner: linking it again starts from them. Never its password. */
  servers: { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; useSsl: boolean } | null
}

/** The "Sign in with IMAP" form, checked: each field refused in words. */
export function imapFormOf(input: Record<string, unknown>): {
  address: string
  password: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  useSsl: boolean
} {
  const address = typeof input.address === 'string' ? input.address.trim().toLowerCase() : ''
  if (!/^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/.test(address) || address.length > 254) {
    throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.imapAddress)
  }
  const password = typeof input.password === 'string' ? input.password : ''
  if (!password || password.length > 1000 || /[\r\n\0]/.test(password)) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.imapPassword)
  const imapHost = mailHostOf(input.imapHost)
  if (!imapHost) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.imapHost('IMAP'))
  const imapPort = mailPortOf(input.imapPort)
  if (!imapPort) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.imapPort('IMAP'))
  const smtpHost = mailHostOf(input.smtpHost)
  if (!smtpHost) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.imapHost('SMTP'))
  const smtpPort = mailPortOf(input.smtpPort)
  if (!smtpPort) throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.imapPort('SMTP'))
  if (typeof input.useSsl !== 'boolean') throw new BadRequestException(EMAIL_ACCOUNTS_REFUSALS.imapSsl)
  return { address, password, imapHost, imapPort, smtpHost, smtpPort, useSsl: input.useSsl }
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
    private readonly security: SecurityService,
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
      // A password is kept only sealed (`secret-box.ts`): with no key, no mailbox is linked by one.
      imap: secretBoxReadiness(),
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
        provider: a.provider as Provider,
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
        servers:
          mine && a.provider === 'imap'
            ? { imapHost: a.imapHost ?? '', imapPort: a.imapPort ?? 0, smtpHost: a.smtpHost ?? '', smtpPort: a.smtpPort ?? 0, useSsl: a.useSsl === true }
            : null,
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

  /**
   * A MAILBOX LINKED BY ITS SERVERS AND ITS PASSWORD, AS CLICKUP'S "SIGN IN
   * WITH IMAP" (`found-12-oct/task-email-imap-unbuilt`): its address, its
   * password, its IMAP and SMTP servers and ports, and whether they require
   * SSL. It is signed in to both ways before it is kept — a mailbox that cannot
   * send or cannot be read is refused in its servers' words — and its password
   * is kept sealed, never in the clear. Linked again by whoever linked it, it
   * is the same mailbox with what was typed now; one somebody else linked is
   * theirs to share. A new one takes room in the plan as any mailbox does.
   */
  async linkImap(workspaceId: string, actor: Actor, input: Record<string, unknown>): Promise<EmailAccountView | undefined> {
    const { role, email } = await this.gate(workspaceId, actor)
    const ready = secretBoxReadiness()
    if (!ready.available) throw new BadRequestException(ready.reason)
    const form = imapFormOf(input)
    const [existing] = await this.db
      .select({ id: emailAccounts.id, ownerId: emailAccounts.ownerId })
      .from(emailAccounts)
      .where(and(eq(emailAccounts.workspaceId, workspaceId), eq(emailAccounts.provider, 'imap'), eq(emailAccounts.address, form.address)))
      .limit(1)
    if (existing && existing.ownerId !== actor.id) throw new ForbiddenException(EMAIL_ACCOUNT_REFUSALS.linkedByAnother)
    if (!existing) await this.connections.assertEmailAccountRoom(workspaceId)
    try {
      await verifyImapMailbox({ provider: 'imap', ...form })
    } catch (err) {
      if (err instanceof MailboxRefused) throw new BadRequestException(err.said)
      throw err
    }
    const id = existing?.id ?? randomUUID()
    const fields = {
      imapHost: form.imapHost,
      imapPort: form.imapPort,
      smtpHost: form.smtpHost,
      smtpPort: form.smtpPort,
      useSsl: form.useSsl,
      passwordSealed: seal(form.password, passwordContext(id)),
      status: 'connected',
      lastError: null,
      updatedAt: new Date(),
    }
    if (existing) {
      await this.db.update(emailAccounts).set(fields).where(eq(emailAccounts.id, id))
    } else {
      const [me] = await this.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, actor.id)).limit(1)
      const name = (me?.displayName ?? '').trim() || form.address.split('@')[0]
      await this.db.insert(emailAccounts).values({ id, workspaceId, ownerId: actor.id, provider: 'imap', address: form.address, senderName: name.slice(0, 120), scopes: [], ...fields })
    }
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      action: 'email_account.linked',
      resourceType: 'email_account',
      resourceId: id,
      description: `Linked a mailbox over IMAP (${form.imapHost}) to send email from`,
      metadata: { provider: 'imap' },
    })
    return (await this.accountsVisibleTo(workspaceId, actor, role, email)).find((x) => x.id === id)
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

  /**
   * A grant that works now: refreshed when it is about to lapse; a refusal marks the mailbox for linking again.
   * An IMAP mailbox's is its servers and its password, opened from its seal — one that no longer opens
   * (another key) is a mailbox to link again.
   */
  private async grantOf(a: AccountRow): Promise<Grant> {
    if (a.provider === 'imap') {
      if (a.status !== 'connected' || !a.passwordSealed) throw new ConflictException(`${EMAIL_ACCOUNTS_REFUSALS.needsReconnect}${a.lastError ? ` — ${a.lastError}` : ''}`)
      let password: string
      try {
        password = openSecret(a.passwordSealed, passwordContext(a.id))
      } catch {
        const refused = new MailboxRefused(EMAIL_ACCOUNTS_REFUSALS.imapUnreadable, true)
        await this.markRefused(a.id, refused)
        throw refused
      }
      return {
        provider: 'imap',
        address: a.address,
        password,
        imapHost: a.imapHost ?? '',
        imapPort: a.imapPort ?? 0,
        smtpHost: a.smtpHost ?? '',
        smtpPort: a.smtpPort ?? 0,
        useSsl: a.useSsl === true,
      }
    }
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

  /**
   * THE GRANT, OR ITS REFUSAL IN WORDS. A refresh the provider refused, or an
   * IMAP password that no longer opens, was thrown as it came — not an HTTP
   * answer — so a send or a draft that met one answered 500
   * (`found-13-oct/a-refused-refresh-answers-500`). It is a 502 in its words.
   */
  private async usableGrant(a: AccountRow): Promise<Grant> {
    try {
      return await this.grantOf(a)
    } catch (err) {
      if (err instanceof MailboxRefused) throw new BadGatewayException(err.said)
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
    const grant = await this.usableGrant(a)
    // One use taken before it goes, only while one is left: the test and the take are one statement.
    const [taken] = await this.db
      .update(emailAccounts)
      .set({ uses: sql`${emailAccounts.uses} + 1` })
      .where(and(eq(emailAccounts.id, a.id), email.uses === null ? sql`true` : sql`${emailAccounts.uses} < ${email.uses}`))
      .returning({ uses: emailAccounts.uses })
    if (!taken) throw new ForbiddenException(EMAIL_PLAN_REFUSALS.uses(planLabel, email.uses ?? 0))
    try {
      const outgoing = { ...mail, fromName: a.senderName, fromAddress: a.address }
      const sent = grant.provider === 'imap' ? await sendFromImap(grant, outgoing, answering) : await sendFromMailbox(grant, outgoing, answering)
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
  async ownMailbox(workspaceId: string, actor: Actor): Promise<{ mailbox: { id: string; provider: Provider; address: string } | null; refusal: string | null }> {
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
    return { mailbox: a ? { id: a.id, provider: a.provider as Provider, address: a.address } : null, refusal: null }
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
  ): Promise<{ account: { id: string; address: string; provider: Provider }; draft: { id: string; messageId: string } }> {
    await this.gate(workspaceId, actor)
    const a = await this.accountIn(workspaceId, accountId)
    if (a.ownerId !== actor.id) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.notYourDrafts)
    if (!mayDraftIn(a)) throw new ConflictException(EMAIL_ACCOUNTS_REFUSALS.draftNeedsRelink(a.address))
    const grant = await this.usableGrant(a)
    try {
      const message = { ...mail, bcc: [], attachments: [], fromName: a.senderName, fromAddress: a.address }
      const draft = grant.provider === 'imap' ? await draftInImap(grant, message) : await draftInMailbox(grant, message)
      return { account: { id: a.id, address: a.address, provider: a.provider as Provider }, draft }
    } catch (err) {
      if (err instanceof MailboxRefused) {
        await this.markRefused(a.id, err)
        throw new BadGatewayException(err.said)
      }
      throw err
    }
  }

  /**
   * THE THREADS' MESSAGES, read from the mailbox they were sent from: Gmail's
   * and Graph's thread by thread, an IMAP mailbox's in one sign-in, without
   * reading again what `known` says is already in its task. A thread the
   * provider cannot give now is left out; a mailbox that cannot be read at all
   * is null — marked to link again when its grant was refused.
   */
  async readThreads(
    accountId: string,
    threadIds: string[],
    known: (providerMessageIds: string[]) => Promise<Set<string>>,
  ): Promise<{ account: AccountRow; threads: Map<string, ThreadMessage[]> } | null> {
    const [a] = await this.db.select().from(emailAccounts).where(eq(emailAccounts.id, accountId)).limit(1)
    if (!a || a.status !== 'connected') return null
    try {
      const grant = await this.grantOf(a)
      if (grant.provider === 'imap') return { account: a, threads: await readImapThreads(grant, threadIds, known) }
      const threads = new Map<string, ThreadMessage[]>()
      for (const threadId of threadIds) {
        try {
          threads.set(threadId, await readMailboxThread(grant, threadId))
        } catch (err) {
          if (err instanceof MailboxRefused && !err.reconnect) continue
          throw err
        }
      }
      return { account: a, threads }
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
