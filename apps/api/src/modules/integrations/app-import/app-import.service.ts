import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { and, eq, inArray } from 'drizzle-orm'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { clickupImportJobs, docs, importGrants, invitations, users, workspaceMembers, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import { R2Service } from '../../../common/storage/r2.service'
import { IMPORT_ACCESS, type Importer } from '../clickup-import/import-access'
import { assertImportTarget } from '../clickup-import/import-target'
import { ImportFilesService } from '../clickup-import/import-files'
import { DocsService } from '../../docs/docs.service'
import { InvitationsService } from '../../invitations/invitations.service'
import { CustomRolesService } from '../../custom-roles/custom-roles.service'
import { ASSIGNABLE_WORKSPACE_ROLES, roleRank } from '../../../common/permissions/workspace-roles'
import { markdownToTiptap } from '../../docs/tiptap-markdown'
import { AppError } from './app-http'
import { envMissing, isAppKey, type AppDef, type AppGrant, type AppKey, type GrantToken } from './app-def'
import { APPS, APPS_TAB } from './apps'
import { imTask, TreeWriter, type ImNode, type ImPerson } from './import-tree'
import { NotionReadError, readNotionExport } from './notion-export'

/**
 * IMPORTERS BY SIGN-IN, AS CLICKUP HAS THEM (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * Asana, Jira, Trello, Todoist, Wrike and Monday are signed in to from the
 * import page — OAuth's way there and back, Trello's token handed back in the
 * address's fragment, Monday's personal API token pasted — and the grant is
 * kept for the person who signed in alone (`import_grants`, sealed), until
 * they take it away; nobody else's import runs on it. They choose where in
 * the tool to read from, what to bring (projects, boards, spaces), how the
 * tool's people map to members here, the choices ClickUp's wizard offers for
 * that tool, and where it goes: new Spaces, or one Space chosen. The run is a
 * job the page follows (`clickup_import_jobs`, source the tool's name); one
 * that fails takes away what it made.
 *
 * And Notion, from its workspace export, as ClickUp imports it.
 */

type State = { ws: string; user: string; app: AppKey; ts: number }

/** What somebody of the tool is invited as: their role there (a member when it does not say), and never above the inviter's. */
export function inviteAs(role: ImPerson['role'], inviterRank: number): string | null {
  const wanted = role === 'admin' ? 'workspace_admin' : role === 'guest' ? 'guest' : 'member'
  if (roleRank(wanted) <= inviterRank) return wanted
  return roleRank('member') <= inviterRank ? 'member' : null
}

export const APP_IMPORT_REFUSALS = {
  unknownApp: 'There is no importer for that tool here',
  notConfigured: (label: string, missing: string[]) => `${label} is not set up on this server — missing backend configuration: ${missing.join(', ')}`,
  notConnected: (label: string) => `Sign in to ${label} first`,
  expired: (label: string) => `The ${label} sign-in expired or was not started here: start it again`,
  noCode: (label: string) => `${label} sent no code back`,
  takesToken: (label: string) => `${label} is signed in to with a personal API token: paste it`,
  noToken: (label: string) => `Paste the ${label} token`,
  noProjects: (label: string) => `Choose at least one thing in ${label} to import`,
  notThere: (label: string) => `None of what was chosen is in that ${label} account`,
  notAMember: 'Each person is mapped to a member of this workspace, or to nobody',
  inviteWho: (label: string) => `Only a person of ${label} with an email, who is not a member here yet, can be invited`,
  inviteRole: 'An invitation makes someone a workspace admin, a manager, a member or a guest',
  mayNotInvite: 'Missing required permission: members.invite',
  aboveOwn: (role: string) => `You cannot invite ${role}: it is above your own role`,
} as const

@Injectable()
export class AppImportService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly config: ConfigService,
    @Optional() private readonly r2?: R2Service,
    @Optional() private readonly files?: ImportFilesService,
    @Optional() private readonly docsService?: DocsService,
    @Optional() private readonly invitationsService?: InvitationsService,
    @Optional() private readonly roles?: CustomRolesService,
  ) {}

  def(app: unknown): AppDef {
    if (!isAppKey(app)) throw new NotFoundException(APP_IMPORT_REFUSALS.unknownApp)
    return APPS[app]
  }

  // ── the sign-in ────────────────────────────────────────────────────────────

  private secret(): string {
    return this.config.get<string>('INTEGRATIONS_OAUTH_STATE_SECRET') ?? this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
  }

  private sign(state: State): string {
    const body = Buffer.from(JSON.stringify(state)).toString('base64url')
    return `${body}.${createHmac('sha256', this.secret()).update(body).digest('base64url')}`
  }

  /** The state, if this server signed it, for this tool, within the last ten minutes. */
  readState(raw: unknown, app: AppKey): State | null {
    if (typeof raw !== 'string') return null
    const [body, sig] = raw.split('.')
    if (!body || !sig) return null
    const want = createHmac('sha256', this.secret()).update(body).digest()
    const got = Buffer.from(sig, 'base64url')
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null
    try {
      const state = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as State
      if (!state.ws || !state.user || state.app !== app || Date.now() - Number(state.ts) > 10 * 60 * 1000) return null
      return state
    } catch {
      return null
    }
  }

  redirectUri(app: AppKey): string {
    const apiBase = process.env.API_PUBLIC_URL ?? process.env.APP_API_URL ?? 'http://localhost:3001'
    return `${apiBase.replace(/\/$/, '')}/api/v1/import/apps/${app}/callback`
  }

  /** Where the import page lands after a sign-in, saying why when it failed. */
  pageUrl(workspaceId: string, app: AppKey, error?: string): string {
    const web = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
    const params = new URLSearchParams({ tab: 'apps', app })
    if (error) params.set('importError', error.slice(0, 300))
    else params.set('connected', app)
    return `${web}/app/${workspaceId}/import?${params.toString()}`
  }

  /** Every tool of the Apps tab, whether the server can sign in to it, and whether this person has. */
  async catalogue(workspaceId: string, importer: Importer) {
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const grants = await this.db
      .select({ provider: importGrants.provider, account: importGrants.account })
      .from(importGrants)
      .where(and(eq(importGrants.workspaceId, workspaceId), eq(importGrants.userId, importer.id)))
    return APPS_TAB.map((d) => {
      const grant = grants.find((g) => g.provider === d.key)
      return { key: d.key, label: d.label, auth: d.auth, configured: envMissing(d.env).length === 0, connected: !!grant, name: grant ? String((grant.account as { name?: string }).name ?? '') : null }
    })
  }

  async status(workspaceId: string, importer: Importer, app: unknown) {
    const d = this.def(app)
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const missing = envMissing(d.env)
    const grant = await this.grant(workspaceId, importer.id, d.key)
    const account = (grant?.account ?? {}) as { name?: string }
    return {
      key: d.key,
      label: d.label,
      auth: d.auth,
      configured: missing.length === 0,
      missing,
      connected: !!grant,
      name: grant ? account.name ?? null : null,
      options: d.options,
      notImported: d.notImported,
    }
  }

  async connect(workspaceId: string, importer: Importer, app: unknown) {
    const d = this.def(app)
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const missing = envMissing(d.env)
    if (missing.length) throw new BadRequestException(APP_IMPORT_REFUSALS.notConfigured(d.label, missing))
    if (d.auth === 'token' || !d.authorizeUrl) throw new BadRequestException(APP_IMPORT_REFUSALS.takesToken(d.label))
    // Trello hands its token back to the import page, in the address's fragment.
    if (d.auth === 'trello') return { authUrl: d.authorizeUrl(`${this.pageUrl(workspaceId, d.key).replace(/&connected=[^&]*/, '')}&signin=1`, '') }
    return { authUrl: d.authorizeUrl(this.redirectUri(d.key), this.sign({ ws: workspaceId, user: importer.id, app: d.key, ts: Date.now() })) }
  }

  /** The way back from the tool's sign-in: the code exchanged for the grant, kept for the person who signed in. */
  async callback(app: AppKey, code: unknown, rawState: unknown): Promise<{ workspaceId: string }> {
    const d = this.def(app)
    const state = this.readState(rawState, d.key)
    if (!state) throw new UnauthorizedException(APP_IMPORT_REFUSALS.expired(d.label))
    if (typeof code !== 'string' || !code) throw new BadRequestException(APP_IMPORT_REFUSALS.noCode(d.label))
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId: state.ws, actorId: state.user })
    if (!d.exchange) throw new BadRequestException(APP_IMPORT_REFUSALS.takesToken(d.label))
    const token = await this.translate(() => d.exchange!(code, this.redirectUri(d.key)))
    await this.keep(state.ws, state.user, d, token)
    return { workspaceId: state.ws }
  }

  /** A token the person has: Monday's pasted, Trello's read off the way back. Kept only once the tool says whose it is. */
  async saveToken(workspaceId: string, importer: Importer, app: unknown, token: unknown) {
    const d = this.def(app)
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    if (d.auth === 'oauth') throw new BadRequestException(`${d.label} is signed in to in its own window, not with a pasted token`)
    const missing = envMissing(d.env)
    if (missing.length) throw new BadRequestException(APP_IMPORT_REFUSALS.notConfigured(d.label, missing))
    const value = typeof token === 'string' ? token.trim() : ''
    if (!value || value.length > 4000) throw new BadRequestException(APP_IMPORT_REFUSALS.noToken(d.label))
    const who = await this.keep(workspaceId, importer.id, d, { accessToken: value, refreshToken: null, expiresAt: null })
    return { connected: true, name: who.name }
  }

  private async keep(workspaceId: string, userId: string, d: AppDef, token: GrantToken) {
    const who = await this.translate(() => d.identify(token))
    const row = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt: token.expiresAt,
      account: { name: who.name, email: who.email, ...who.account } as Record<string, unknown>,
      updatedAt: new Date(),
    }
    await this.db
      .insert(importGrants)
      .values({ workspaceId, userId, provider: d.key, ...row })
      .onConflictDoUpdate({ target: [importGrants.workspaceId, importGrants.userId, importGrants.provider], set: row })
    return who
  }

  async disconnect(workspaceId: string, importer: Importer, app: unknown) {
    const d = this.def(app)
    await this.db
      .delete(importGrants)
      .where(and(eq(importGrants.workspaceId, workspaceId), eq(importGrants.userId, importer.id), eq(importGrants.provider, d.key)))
    return { connected: false }
  }

  private async grant(workspaceId: string, userId: string, app: AppKey) {
    const [row] = await this.db
      .select()
      .from(importGrants)
      .where(and(eq(importGrants.workspaceId, workspaceId), eq(importGrants.userId, userId), eq(importGrants.provider, app)))
      .limit(1)
    return row ?? null
  }

  /** The person's own grant, its token refreshed when it has run out. */
  private async live(workspaceId: string, userId: string, d: AppDef): Promise<AppGrant> {
    const grant = await this.grant(workspaceId, userId, d.key)
    // A sealed token that does not open on this server reads as empty: signed in again, as a revoked one is.
    if (!grant?.accessToken) throw new BadRequestException(APP_IMPORT_REFUSALS.notConnected(d.label))
    let token = grant.accessToken
    let account = (grant.account ?? {}) as Record<string, unknown>
    if (grant.tokenExpiresAt && grant.tokenExpiresAt.getTime() < Date.now() + 60_000 && grant.refreshToken && d.refresh) {
      const fresh = await this.translate(() => d.refresh!(grant.refreshToken!, this.redirectUri(d.key)))
      token = fresh.accessToken
      if (typeof fresh.extra?.host === 'string') account = { ...account, host: fresh.extra.host }
      await this.db
        .update(importGrants)
        .set({ accessToken: fresh.accessToken, refreshToken: fresh.refreshToken ?? grant.refreshToken, tokenExpiresAt: fresh.expiresAt, account, updatedAt: new Date() })
        .where(eq(importGrants.id, grant.id))
    }
    return { accessToken: token, account }
  }

  /** The tool's refusals in its words: a refused grant is a sign-in to do again (409), not this session's. */
  private async translate<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof AppError) {
        if (e.status === 401) throw new ConflictException(e.message)
        throw new BadRequestException(e.message)
      }
      throw e
    }
  }

  async sources(workspaceId: string, importer: Importer, app: unknown) {
    const d = this.def(app)
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const grant = await this.live(workspaceId, importer.id, d)
    return this.translate(() => d.reader(grant).sources())
  }

  async projects(workspaceId: string, importer: Importer, app: unknown, source: unknown) {
    const d = this.def(app)
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const grant = await this.live(workspaceId, importer.id, d)
    return this.translate(() => d.reader(grant).projects(String(source ?? '')))
  }

  /** The tool's people, each with the member here they would be filed under by email; and the members to choose from. */
  async people(workspaceId: string, importer: Importer, app: unknown, source: unknown, projects: unknown) {
    const d = this.def(app)
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const grant = await this.live(workspaceId, importer.id, d)
    const ids = String(projects ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200)
    const found = await this.translate(() => d.reader(grant).people(String(source ?? ''), ids))
    const members = await this.members(workspaceId)
    const byEmail = new Map(members.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m.id]))
    // Anybody with an address here at all — a guest too — is not somebody to invite.
    const here = await this.addressesHere(workspaceId)
    const inviter = await this.inviteRank(workspaceId, importer)
    return {
      people: found.map((p) => {
        const match = p.email ? byEmail.get(p.email) ?? null : null
        // Whom the importer may invite instead, and as what: the tool's role for them, no higher than the importer's own.
        const invite = inviter && p.email && !here.has(p.email) ? inviteAs(p.role, inviter.rank) : null
        return { key: p.key, name: p.name, email: p.email, match, role: p.role ?? null, invite }
      }),
      members: members.map((m) => ({ id: m.id, name: m.name, email: m.email })),
      mayInvite: !!inviter,
    }
  }

  /** Every address with a membership here, guests' too, in lower case. */
  private async addressesHere(workspaceId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
    return new Set(rows.map((r) => r.email?.trim().toLowerCase()).filter((e): e is string => !!e))
  }

  /**
   * Whether the importer may invite here, and the rank they may invite up to: `POST /invitations`'s
   * rule (`InvitationsController.createSingular`) — `members.invite`, and nobody above their own role.
   */
  private async inviteRank(workspaceId: string, importer: Importer): Promise<{ rank: number } | null> {
    if (!this.invitationsService || !this.roles) return null
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, importer.id)))
      .limit(1)
    const superAdmin = importer.role === 'super_admin'
    if (!m && !superAdmin) return null
    if (!superAdmin && !(await this.roles.hasPermission(workspaceId, importer.id, 'members.invite'))) return null
    return { rank: superAdmin ? roleRank('super_admin') : roleRank(m?.role) }
  }

  /** The workspace's members, guests aside: whom a person of the tool may be mapped to. */
  private async members(workspaceId: string) {
    const rows = await this.db
      .select({ id: users.id, name: users.displayName, email: users.email, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
    return rows.filter((r) => r.role !== 'guest').map((r) => ({ id: r.id, name: r.name ?? r.email ?? '', email: r.email?.toLowerCase() ?? null }))
  }

  // ── the import ─────────────────────────────────────────────────────────────

  async start(
    workspaceId: string,
    importer: Importer,
    app: unknown,
    dto: { source?: unknown; projectIds?: unknown; spaceId?: unknown; options?: unknown; people?: unknown; invite?: unknown },
  ) {
    const d = this.def(app)
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const spaceId = typeof dto.spaceId === 'string' && dto.spaceId ? dto.spaceId : null
    if (spaceId !== null) await assertImportTarget(this.db, { workspaceId, spaceId, actorId: importer.id })
    const ids = Array.isArray(dto.projectIds) ? [...new Set(dto.projectIds.map(String))].slice(0, 200) : []
    if (!ids.length) throw new BadRequestException(APP_IMPORT_REFUSALS.noProjects(d.label))
    const options = this.options(d, dto.options)
    const people = await this.peopleMap(workspaceId, dto.people)
    const grant = await this.live(workspaceId, importer.id, d)
    const reader = d.reader(grant)
    const source = String(dto.source ?? '')
    const sources = await this.translate(() => reader.sources())
    const from = sources.find((s) => s.id === source) ?? (sources.length === 1 ? sources[0] : undefined)
    if (!from) throw new BadRequestException(APP_IMPORT_REFUSALS.notThere(d.label))
    const all = await this.translate(() => reader.projects(from.id))
    const chosen = all.filter((p) => ids.includes(p.id))
    if (!chosen.length) throw new BadRequestException(APP_IMPORT_REFUSALS.notThere(d.label))
    const wanted = this.inviteWanted(dto.invite)
    const tool = wanted.size ? await this.translate(() => reader.people(from.id, chosen.map((p) => p.id))) : []
    const invited = await this.invite(workspaceId, importer, d.label, wanted, tool, people)
    const [job] = await this.db
      .insert(clickupImportJobs)
      .values({ workspaceId, createdById: importer.id, status: 'pending', total: chosen.length, source: d.key })
      .returning({ id: clickupImportJobs.id })
    const writer = new TreeWriter(
      this.db,
      this.r2 ?? null,
      { jobId: job.id, workspaceId, importer, spaceId, newSpaceName: from.name, source: d.key, label: d.label, icon: d.icon },
      people,
      d.notImported,
      new Map(invited.map((i) => [i.key, i.email])),
    )
    writer.summary.invited = invited.map((i) => ({ name: i.name, email: i.email, role: i.role }))
    void this.run(writer, chosen.length, chosen.map((p) => () => reader.read(from.id, p, options))).catch(() => undefined)
    return { jobId: job.id, invited: invited.length }
  }

  /** Awaitable, so a test can run it and read the summary: each project read, then written, one at a time. */
  async run(writer: TreeWriter, total: number, reads: Array<() => Promise<ImNode>>) {
    try {
      await writer.begin(total)
      for (const [n, read] of reads.entries()) await writer.node(await read(), n)
      return await writer.finish()
    } catch (e) {
      await writer.fail(e)
      throw e
    }
  }

  /** Each choice the tool offers, as asked when it is one of its values, else as ClickUp's wizard starts it. */
  private options(d: AppDef, raw: unknown): Record<string, string> {
    const given = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    return Object.fromEntries(d.options.map((o) => [o.key, typeof given[o.key] === 'string' && o.choices.includes(given[o.key] as string) ? (given[o.key] as string) : o.default]))
  }

  /** Whom the importer chose to invite, by the tool's key, and as what. */
  private inviteWanted(raw: unknown): Map<string, string> {
    const out = new Map<string, string>()
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
    for (const [key, role] of Object.entries(raw as Record<string, unknown>).slice(0, 2000)) {
      if (typeof role !== 'string' || !(ASSIGNABLE_WORKSPACE_ROLES as readonly string[]).includes(role)) throw new BadRequestException(APP_IMPORT_REFUSALS.inviteRole)
      out.set(key.slice(0, 300), role)
    }
    return out
  }

  /**
   * THE TOOL'S PEOPLE ASKED TO JOIN (`found-14-oct/clickup-workspace-import-and-people-unbuilt`).
   *
   * Each one the importer chose — a person of the tool with an email, not a member here and
   * mapped to nobody — is invited into this workspace as `POST /invitations` invites: by somebody
   * holding `members.invite`, at no role above their own, the invitation sent by email. An open
   * invitation of the same address into this workspace is theirs already, and is not sent twice.
   * Their tasks wait for them (`import_pending_assignees`) until they accept it.
   */
  private async invite(
    workspaceId: string,
    importer: Importer,
    label: string,
    wanted: Map<string, string>,
    tool: ImPerson[],
    people: Map<string, string | null>,
  ): Promise<Array<{ key: string; name: string | null; email: string; role: string }>> {
    if (!wanted.size) return []
    const inviter = await this.inviteRank(workspaceId, importer)
    if (!inviter) throw new ForbiddenException(APP_IMPORT_REFUSALS.mayNotInvite)
    const byKey = new Map(tool.map((p) => [p.key, p]))
    const here = await this.addressesHere(workspaceId)
    const chosen: Array<{ key: string; name: string | null; email: string; role: string }> = []
    for (const [key, role] of wanted) {
      const p = byKey.get(key)
      if (!p?.email || here.has(p.email) || people.get(key)) throw new BadRequestException(APP_IMPORT_REFUSALS.inviteWho(label))
      if (roleRank(role) > inviter.rank) throw new ForbiddenException(APP_IMPORT_REFUSALS.aboveOwn(role))
      chosen.push({ key, name: p.name, email: p.email, role })
    }
    const [ws] = await this.db.select({ organizationId: workspaces.organizationId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
    if (!ws) throw new NotFoundException('Workspace not found')
    const open = await this.db
      .select({ email: invitations.email, memberships: invitations.workspaceMemberships })
      .from(invitations)
      .where(and(eq(invitations.organizationId, ws.organizationId), eq(invitations.status, 'pending'), inArray(invitations.email, chosen.map((c) => c.email))))
    const already = new Set(
      open
        .filter((o) => Array.isArray(o.memberships) && (o.memberships as Array<{ workspaceId?: string }>).some((m) => m?.workspaceId === workspaceId))
        .map((o) => o.email.toLowerCase()),
    )
    for (const c of chosen) {
      if (already.has(c.email)) continue
      await this.invitationsService!.create(ws.organizationId, importer.id, { email: c.email, orgRole: 'member', workspaceMemberships: [{ workspaceId, role: c.role }] })
    }
    return chosen
  }

  /** Whom the importer mapped each person to: a member here (not a guest), or nobody. */
  private async peopleMap(workspaceId: string, raw: unknown): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>()
    if (!raw || typeof raw !== 'object') return out
    const entries = Object.entries(raw as Record<string, unknown>).slice(0, 5000)
    const ids = [...new Set(entries.map(([, v]) => v).filter((v): v is string => typeof v === 'string' && !!v))]
    if (ids.length) {
      const members = await this.db
        .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, ids)))
      const ok = new Set(members.filter((m) => m.role !== 'guest').map((m) => m.userId))
      if (ids.some((id) => !ok.has(id))) throw new BadRequestException(APP_IMPORT_REFUSALS.notAMember)
    }
    for (const [key, v] of entries) out.set(key.slice(0, 300), typeof v === 'string' && v ? v : null)
    return out
  }

  // ── Notion, from its export ──────────────────────────────────────────────────

  /**
   * A Notion workspace's export: its databases into one Folder — each a List,
   * each row a task with its page as the description and its properties as
   * text fields — and its pages into Docs, nested as Notion nests them, in
   * the same Space. Run as a job, as the other importers'.
   */
  async notionStart(workspaceId: string, importer: Importer, dto: { fileKey?: unknown; spaceId?: unknown }) {
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const files = this.files
    if (!files) throw new BadRequestException('Files to import are not read on this server')
    const spaceId = typeof dto.spaceId === 'string' && dto.spaceId ? dto.spaceId : null
    if (spaceId !== null) await assertImportTarget(this.db, { workspaceId, spaceId, actorId: importer.id })
    let exp: ReturnType<typeof readNotionExport>
    try {
      exp = readNotionExport(await files.read(workspaceId, importer.id, dto.fileKey, 'notion'))
    } catch (e) {
      await files.discard(workspaceId, importer.id, dto.fileKey)
      if (e instanceof NotionReadError) throw new BadRequestException(e.message)
      throw e
    }
    await files.discard(workspaceId, importer.id, dto.fileKey)
    if (!exp.pages.length && !exp.databases.length) throw new BadRequestException('The Notion export holds no pages or databases to import')
    const [job] = await this.db
      .insert(clickupImportJobs)
      .values({ workspaceId, createdById: importer.id, status: 'pending', total: 1 + (exp.pages.length ? 1 : 0), source: 'notion' })
      .returning({ id: clickupImportJobs.id })
    const notImported = ['Comments and attachments in databases, as ClickUp’s Notion import leaves them', 'Who may see what: Notion’s sharing does not come over']
    const writer = new TreeWriter(this.db, this.r2 ?? null, { jobId: job.id, workspaceId, importer, spaceId, newSpaceName: 'Notion', source: 'notion', label: 'Notion', icon: '📓' }, new Map(), notImported)
    void this.notionRun(writer, workspaceId, importer, spaceId, exp).catch(() => undefined)
    return { jobId: job.id }
  }

  async notionRun(writer: TreeWriter, workspaceId: string, importer: Importer, spaceId: string | null, exp: ReturnType<typeof readNotionExport>) {
    let madeDocs: string[] = []
    try {
      await writer.begin(1 + (exp.pages.length ? 1 : 0))
      if (exp.databases.length) {
        await writer.node(
          {
            kind: 'folder',
            folder: {
              name: 'Notion databases',
              lists: exp.databases.map((db) => ({
                name: db.title,
                statuses: null,
                tasks: db.rows.map((r, n) =>
                  imTask(`${db.key}#${n}`, r.title, { description: r.markdown, fields: r.values.map((v) => ({ name: v.name, type: 'text' as const, value: v.value })) }),
                ),
              })),
            },
          },
          0,
        )
      }
      if (exp.pages.length) {
        if (!this.docsService) throw new Error('Docs are not made on this server')
        // In the Space the databases went to; with no databases, beside the workspace's other Docs.
        const where = spaceId ?? writer.summary.made.spaces[0]?.id ?? null
        const made = await this.docsService.importPageTree(workspaceId, importer.id, {
          spaceId: where,
          pages: exp.pages.map((p) => ({ key: p.key, parent: p.parent, title: p.title, content: markdownToTiptap(stripTitle(p.markdown, p.title)) })),
        })
        madeDocs = made.docs.map((x) => x.id)
        writer.summary.docs = made.docs
        writer.summary.pagesImported = made.pagesImported
      }
      return await writer.finish()
    } catch (e) {
      if (madeDocs.length) await this.db.delete(docs).where(inArray(docs.id, madeDocs)).catch(() => undefined)
      await writer.fail(e)
      throw e
    }
  }
}

/** A page's Markdown without the title Notion writes at its head, which is the Doc's own. */
function stripTitle(md: string, title: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  if (lines[0] && /^#\s/.test(lines[0]) && lines[0].replace(/^#\s+/, '').trim() === title.trim()) return lines.slice(1).join('\n').trim()
  return md.trim()
}
