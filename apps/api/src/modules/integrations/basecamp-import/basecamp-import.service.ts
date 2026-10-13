import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { and, eq, inArray } from 'drizzle-orm'
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  clickupImportJobs,
  importGrants,
  listStatuses,
  lists,
  projects,
  spaces,
  taskAssignees,
  taskComments,
  tasks,
  users,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import { IMPORT_ACCESS, MAY_NOT_BE_ASSIGNED, type Importer } from '../clickup-import/import-access'
import { assertImportTarget } from '../clickup-import/import-target'
import { DEFAULT_STATUSES, storable } from '../clickup-import/spreadsheet-import.util'
import { htmlToTiptap } from '../../docs/html-tiptap'
import { tiptapToMarkdown } from '../../docs/tiptap-markdown'
import {
  BASECAMP_REFUSALS,
  BasecampClient,
  BasecampError,
  basecampAuthorizeUrl,
  basecampEnvMissing,
  basecampIdentity,
  exchangeBasecampCode,
  refreshBasecampToken,
  type BasecampAccount,
  type BcComment,
  type BcProject,
  type BcTodo,
  type BcTodolist,
} from './basecamp-api'

/**
 * BASECAMP, IMPORTED AS CLICKUP IMPORTS IT (`commit-log/log-601eacc-2`).
 *
 * The person signs in to Basecamp from the import page — Basecamp 3 — and
 * chooses the account and the projects and teams to bring over, and where:
 *   · into NEW SPACES, one named for each project, its to-do lists as Lists
 *     with no Folder (ClickUp: "Basecamp lists become ClickUp Lists without
 *     Folders");
 *   · or into ONE EXISTING SPACE, each project a Folder (a Rundesk project)
 *     holding its Lists, as ClickUp recommends for related projects.
 * Each to-do is a task: its title, its notes as its description, its due and
 * start dates, its assignees — members here with the same email, whom the task
 * lets be assigned — done when it was done; its to-do groups the List's
 * statuses ("Basecamp to-do groups as ClickUp statuses"); its comments the
 * task's comments, under their author when they are a member here and under
 * the person importing, with the author's name, when not.
 *
 * THE GRANT IS THE IMPORTER'S OWN (`import_grants`): it reads what their
 * Basecamp shows them, so nobody else runs an import on it, and they can take
 * it away. A run is a job the page follows, as the spreadsheet import's is
 * (`clickup_import_jobs`, source `basecamp`); one that fails takes away the
 * spaces and folders it made.
 */

export const BASECAMP_SOURCE = 'basecamp'

type State = { ws: string; user: string; ts: number }

export type BasecampImportSummary = {
  source: 'basecamp'
  spacesCreated: number
  foldersCreated: number
  listsCreated: number
  tasksCreated: number
  tasksDone: number
  statusesFromGroups: number
  assigneesLinked: number
  assigneesUnmatched: number
  commentsImported: number
  projects: Array<{ name: string; lists: number; tasks: number }>
  errors: string[]
}

const PALETTE = ['#64748b', '#0ea5e9', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899']

@Injectable()
export class BasecampImportService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly config: ConfigService,
  ) {}

  // ── the sign-in ────────────────────────────────────────────────────────────

  private secret(): string {
    return this.config.get<string>('INTEGRATIONS_OAUTH_STATE_SECRET') ?? this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
  }

  private sign(state: State): string {
    const body = Buffer.from(JSON.stringify(state)).toString('base64url')
    return `${body}.${createHmac('sha256', this.secret()).update(body).digest('base64url')}`
  }

  /** The state, if this server signed it within the last ten minutes. */
  readState(raw: unknown): State | null {
    if (typeof raw !== 'string') return null
    const [body, sig] = raw.split('.')
    if (!body || !sig) return null
    const want = createHmac('sha256', this.secret()).update(body).digest()
    const got = Buffer.from(sig, 'base64url')
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null
    try {
      const state = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as State
      if (!state.ws || !state.user || Date.now() - Number(state.ts) > 10 * 60 * 1000) return null
      return state
    } catch {
      return null
    }
  }

  redirectUri(): string {
    const apiBase = process.env.API_PUBLIC_URL ?? process.env.APP_API_URL ?? 'http://localhost:3001'
    return `${apiBase.replace(/\/$/, '')}/api/v1/import/basecamp/callback`
  }

  /** Where the import page lands after the sign-in, saying why when it failed. */
  pageUrl(workspaceId: string, error?: string): string {
    const web = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
    const params = new URLSearchParams({ tab: 'basecamp' })
    if (error) params.set('importError', error.slice(0, 300))
    else params.set('connected', 'basecamp')
    return `${web}/app/${workspaceId}/import?${params.toString()}`
  }

  /** Whether this person may sign in to Basecamp to import here, and whether the server can. */
  async status(workspaceId: string, importer: Importer) {
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const missing = basecampEnvMissing()
    const grant = await this.grant(workspaceId, importer.id)
    const account = (grant?.account ?? {}) as { name?: string; accounts?: BasecampAccount[] }
    return {
      configured: missing.length === 0,
      missing,
      connected: !!grant,
      name: grant ? account.name ?? null : null,
      accounts: grant ? (account.accounts ?? []).map((a) => ({ id: a.id, name: a.name })) : [],
    }
  }

  async connect(workspaceId: string, importer: Importer) {
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const missing = basecampEnvMissing()
    if (missing.length) throw new BadRequestException(BASECAMP_REFUSALS.notConfigured(missing))
    return { authUrl: basecampAuthorizeUrl(this.redirectUri(), this.sign({ ws: workspaceId, user: importer.id, ts: Date.now() })) }
  }

  /** The way back from Launchpad: the code exchanged for the grant, kept for the person who signed in. */
  async callback(code: unknown, rawState: unknown): Promise<{ workspaceId: string }> {
    const state = this.readState(rawState)
    if (!state) throw new UnauthorizedException('The Basecamp sign-in expired or was not started here: start it again')
    if (typeof code !== 'string' || !code) throw new BadRequestException('Basecamp sent no code back')
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId: state.ws, actorId: state.user })
    const token = await exchangeBasecampCode(code, this.redirectUri())
    const who = await basecampIdentity(token.accessToken)
    const row = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt: token.expiresAt,
      account: { name: who.name, email: who.email, accounts: who.accounts } as Record<string, unknown>,
      updatedAt: new Date(),
    }
    await this.db
      .insert(importGrants)
      .values({ workspaceId: state.ws, userId: state.user, provider: BASECAMP_SOURCE, ...row })
      .onConflictDoUpdate({ target: [importGrants.workspaceId, importGrants.userId, importGrants.provider], set: row })
    return { workspaceId: state.ws }
  }

  async disconnect(workspaceId: string, importer: Importer) {
    await this.db
      .delete(importGrants)
      .where(and(eq(importGrants.workspaceId, workspaceId), eq(importGrants.userId, importer.id), eq(importGrants.provider, BASECAMP_SOURCE)))
    return { connected: false }
  }

  private async grant(workspaceId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(importGrants)
      .where(and(eq(importGrants.workspaceId, workspaceId), eq(importGrants.userId, userId), eq(importGrants.provider, BASECAMP_SOURCE)))
      .limit(1)
    return row ?? null
  }

  /** A client on the person's own grant, its token refreshed when it has run out; and the account asked for. */
  private async client(workspaceId: string, userId: string, accountId: unknown): Promise<{ client: BasecampClient; account: BasecampAccount }> {
    const grant = await this.grant(workspaceId, userId)
    if (!grant?.accessToken) throw new BadRequestException(BASECAMP_REFUSALS.notConnected)
    const accounts = ((grant.account ?? {}) as { accounts?: BasecampAccount[] }).accounts ?? []
    const account = accounts.find((a) => a.id === String(accountId)) ?? (accountId === undefined && accounts.length === 1 ? accounts[0] : undefined)
    if (!account) throw new BadRequestException(BASECAMP_REFUSALS.noAccount)
    let token = grant.accessToken
    if (grant.tokenExpiresAt && grant.tokenExpiresAt.getTime() < Date.now() + 60_000 && grant.refreshToken) {
      const fresh = await refreshBasecampToken(grant.refreshToken, this.redirectUri())
      token = fresh.accessToken
      await this.db
        .update(importGrants)
        .set({ accessToken: fresh.accessToken, refreshToken: fresh.refreshToken, tokenExpiresAt: fresh.expiresAt, updatedAt: new Date() })
        .where(eq(importGrants.id, grant.id))
    }
    return { client: new BasecampClient(token), account }
  }

  /** The account's projects and teams, for the page to choose from. */
  async projects(workspaceId: string, importer: Importer, accountId: unknown) {
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const { client, account } = await this.translate(() => this.client(workspaceId, importer.id, accountId))
    const rows = await this.translate(() => client.projects(account))
    return rows.map((p) => ({
      id: String(p.id),
      name: p.name,
      description: plainText(p.description),
      kind: p.purpose === 'team' ? 'team' : p.purpose === 'company_hq' ? 'hq' : 'project',
      hasTodos: (p.dock ?? []).some((d) => d.name === 'todoset' && d.enabled !== false),
    }))
  }

  /** Basecamp's refusals in their words, with the status they mean here. */
  private async translate<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof BasecampError) {
        if (e.status === 401) throw new UnauthorizedException(e.message)
        throw new BadRequestException(e.message)
      }
      throw e
    }
  }

  // ── the import ─────────────────────────────────────────────────────────────

  async start(workspaceId: string, importer: Importer, dto: { accountId?: unknown; projectIds?: unknown; spaceId?: unknown }) {
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const spaceId = dto.spaceId === undefined || dto.spaceId === null || dto.spaceId === '' ? null : dto.spaceId
    if (spaceId !== null) await assertImportTarget(this.db, { workspaceId, spaceId, actorId: importer.id })
    const ids = Array.isArray(dto.projectIds) ? dto.projectIds.map(String) : []
    if (!ids.length) throw new BadRequestException('Choose at least one Basecamp project or team to import')
    const { client, account } = await this.translate(() => this.client(workspaceId, importer.id, dto.accountId))
    const all = await this.translate(() => client.projects(account))
    const chosen = all.filter((p) => ids.includes(String(p.id)))
    if (!chosen.length) throw new BadRequestException('None of the projects chosen is in that Basecamp account')
    const [job] = await this.db
      .insert(clickupImportJobs)
      .values({ workspaceId, createdById: importer.id, status: 'pending', total: chosen.length, source: BASECAMP_SOURCE })
      .returning({ id: clickupImportJobs.id })
    void this.run(job.id, workspaceId, importer, client, chosen, spaceId as string | null).catch(() => undefined)
    return { jobId: job.id }
  }

  /** Awaitable, so a test can run it and read the summary. */
  async run(jobId: string, workspaceId: string, importer: Importer, client: BasecampClient, chosen: BcProject[], spaceId: string | null): Promise<BasecampImportSummary> {
    const summary: BasecampImportSummary = {
      source: 'basecamp',
      spacesCreated: 0,
      foldersCreated: 0,
      listsCreated: 0,
      tasksCreated: 0,
      tasksDone: 0,
      statusesFromGroups: 0,
      assigneesLinked: 0,
      assigneesUnmatched: 0,
      commentsImported: 0,
      projects: [],
      errors: [],
    }
    const madeSpaces: string[] = []
    const madeProjects: string[] = []
    try {
      await this.db.update(clickupImportJobs).set({ status: 'processing', updatedAt: new Date() }).where(eq(clickupImportJobs.id, jobId))
      const byEmail = await this.membersByEmail(workspaceId)
      let done = 0
      for (const project of chosen) {
        // Where its lists go: a new Space named for it, or a Folder in the Space chosen.
        let containerId: string
        let inSpace: string
        if (spaceId) {
          const [folder] = await this.db
            .insert(projects)
            .values({ spaceId, name: project.name.slice(0, 200), description: plainText(project.description) || null, createdById: importer.id })
            .returning({ id: projects.id })
          madeProjects.push(folder.id)
          summary.foldersCreated++
          containerId = folder.id
          inSpace = spaceId
        } else {
          const [space] = await this.db
            .insert(spaces)
            .values({ workspaceId, name: project.name.slice(0, 200), icon: '🏕️', color: PALETTE[summary.spacesCreated % PALETTE.length] })
            .returning({ id: spaces.id })
          madeSpaces.push(space.id)
          summary.spacesCreated++
          const [container] = await this.db
            .insert(projects)
            .values({ spaceId: space.id, name: 'Lists', isDefaultContainer: true, createdById: importer.id })
            .returning({ id: projects.id })
          containerId = container.id
          inSpace = space.id
        }

        const todolists = await client.todolists(project)
        let projectTasks = 0
        for (const [position, list] of todolists.entries()) {
          projectTasks += await this.importList(workspaceId, importer, client, list, containerId, inSpace, position, byEmail, summary)
        }
        summary.projects.push({ name: project.name, lists: todolists.length, tasks: projectTasks })
        done++
        await this.db
          .update(clickupImportJobs)
          .set({ processed: done, createdCount: summary.tasksCreated, updatedAt: new Date() })
          .where(eq(clickupImportJobs.id, jobId))
          .catch(() => undefined)
      }
      await this.db
        .update(clickupImportJobs)
        .set({
          status: 'completed',
          processed: chosen.length,
          createdCount: summary.tasksCreated,
          result: storable(summary) as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(clickupImportJobs.id, jobId))
      return summary
    } catch (e: any) {
      // What it made goes: the folders in the Space chosen, and the spaces it made, their lists and tasks with them.
      if (madeProjects.length) await this.db.delete(projects).where(inArray(projects.id, madeProjects)).catch(() => undefined)
      if (madeSpaces.length) await this.db.delete(spaces).where(inArray(spaces.id, madeSpaces)).catch(() => undefined)
      const message = e instanceof BasecampError ? e.message : e?.message ?? 'Import failed'
      await this.db
        .update(clickupImportJobs)
        .set({ status: 'failed', error: storable(message), createdCount: 0, updatedAt: new Date() })
        .where(eq(clickupImportJobs.id, jobId))
        .catch(() => undefined)
      throw e
    }
  }

  /** One to-do list as a List: its groups as statuses, its to-dos as tasks with their people and comments. */
  private async importList(
    workspaceId: string,
    importer: Importer,
    client: BasecampClient,
    list: BcTodolist,
    containerId: string,
    spaceId: string,
    position: number,
    byEmail: Map<string, string>,
    summary: BasecampImportSummary,
  ): Promise<number> {
    const name = (list.name ?? list.title ?? 'To-dos').slice(0, 200)
    const [row] = await this.db
      .insert(lists)
      .values({ projectId: containerId, spaceId, name, description: plainText(list.description) || null, position, createdById: importer.id })
      .returning({ id: lists.id })
    summary.listsCreated++

    // The groups: each a status of this list, after "To do", open.
    const groups = await client.groups(list)
    const statusRows: Array<{ listId: string; key: string; name: string; color: string; category: 'open' | 'in_progress' | 'closed'; position: number }> =
      DEFAULT_STATUSES.map((s) => ({ listId: row.id, key: s.key, name: s.name, color: s.color, category: s.category, position: s.position >= 2 ? s.position + groups.length : s.position }))
    const keyOfGroup = new Map<number, string>()
    const used = new Set<string>(DEFAULT_STATUSES.map((s) => s.key))
    groups.forEach((g, n) => {
      const key = uniqueKey(g.name ?? g.title ?? `group-${n + 1}`, used)
      used.add(key)
      keyOfGroup.set(g.id, key)
      statusRows.push({ listId: row.id, key, name: (g.name ?? g.title ?? key).slice(0, 60), color: PALETTE[n % PALETTE.length], category: 'open', position: 2 + n })
    })
    await this.db.insert(listStatuses).values(statusRows).onConflictDoNothing()
    summary.statusesFromGroups += groups.length

    // The list's own to-dos, then each group's.
    const todos: Array<{ todo: BcTodo; status: string | null }> = (list.todos_url ? await client.todos(list.todos_url) : []).map((todo) => ({ todo, status: null }))
    for (const g of groups) {
      if (!g.todos_url) continue
      for (const todo of await client.todos(g.todos_url)) todos.push({ todo, status: keyOfGroup.get(g.id) ?? null })
    }

    let made = 0
    for (const [n, { todo, status }] of todos.entries()) {
      try {
        const title = (todo.content ?? todo.title ?? '').trim().slice(0, 500) || 'Untitled to-do'
        const doneAt = todo.completed ? new Date(todo.completion?.created_at ?? Date.now()) : null
        const [task] = await this.db
          .insert(tasks)
          .values({
            listId: row.id,
            createdById: importer.id,
            title,
            description: markdownOf(todo.description) || null,
            status: todo.completed ? 'done' : status ?? 'todo',
            statusCategory: todo.completed ? 'closed' : 'open',
            completedAt: doneAt,
            position: n,
            dueDate: dayOf(todo.due_on),
            startDate: dayOf(todo.starts_on),
          })
          .returning({ id: tasks.id })
        made++
        summary.tasksCreated++
        if (todo.completed) summary.tasksDone++

        for (const person of todo.assignees ?? []) {
          const userId = person.email_address ? byEmail.get(person.email_address.trim().toLowerCase()) : undefined
          if (!userId) {
            summary.assigneesUnmatched++
            continue
          }
          if (!(await IMPORT_ACCESS.mayBeAssigned(this.db, { workspaceId, taskId: task.id, userId }))) {
            summary.assigneesUnmatched++
            summary.errors.push(`"${title}": ${person.name ?? person.email_address} ${MAY_NOT_BE_ASSIGNED}`)
            continue
          }
          await this.db.insert(taskAssignees).values({ taskId: task.id, userId }).onConflictDoNothing()
          summary.assigneesLinked++
        }

        for (const c of await client.comments(todo)) {
          await this.importComment(task.id, importer.id, c, byEmail)
          summary.commentsImported++
        }
      } catch (e: any) {
        if (e instanceof BasecampError && e.status === 401) throw e
        summary.errors.push(`To-do "${todo.content ?? todo.id}": ${e?.message ?? 'unknown error'}`)
      }
    }
    return made
  }

  /**
   * A Basecamp comment as a task comment: under its author when they are a
   * member here by email, else under the person importing with the author's
   * name and moment at its head — as the ClickUp import files a comment it
   * cannot place (`found-6-oct/enrichment-files-comments-under-a-matched-name`).
   */
  private async importComment(taskId: string, importerId: string, c: BcComment, byEmail: Map<string, string>) {
    const text = markdownOf(c.content)
    const email = c.creator?.email_address?.trim().toLowerCase()
    const author = email ? byEmail.get(email) : undefined
    const at = c.created_at ? new Date(c.created_at) : null
    const when = at && !Number.isNaN(at.getTime()) ? at : null
    const body = author ? text : `**${c.creator?.name ?? email ?? 'Someone'}** _(Basecamp comment · ${when ? when.toISOString() : 'unknown date'})_\n\n${text}`.trim()
    await this.db.insert(taskComments).values({
      taskId,
      authorId: author ?? importerId,
      body: storable(body || '(empty Basecamp comment)'),
      ...(when ? { createdAt: when } : {}),
    })
  }

  /** Members here by email: whom an assignee or a comment may be filed under. A guest is matched to nothing. */
  private async membersByEmail(workspaceId: string): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ userId: users.id, email: users.email, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
    const out = new Map<string, string>()
    for (const r of rows) if (r.email && r.role !== 'guest') out.set(r.email.trim().toLowerCase(), r.userId)
    return out
  }

}

/** Basecamp's rich text (HTML) as the Markdown a task's description and comments hold. */
export function markdownOf(html: string | null | undefined): string {
  if (!html || !html.trim()) return ''
  return tiptapToMarkdown(htmlToTiptap(html)).trim()
}

export function plainText(html: string | null | undefined): string {
  return markdownOf(html).replace(/[*_~`#>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1000)
}

/** A `YYYY-MM-DD` day as the start of that day, UTC, as a sheet's dates are read; anything else, none. */
function dayOf(day: string | null | undefined): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const d = new Date(`${day}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A status key from a group's name, distinct from the list's others. */
function uniqueKey(name: string, used: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'group'
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`
}
