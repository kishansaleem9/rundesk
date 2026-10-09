import { Injectable, Inject, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, asc, eq, inArray, isNotNull, or, type SQL } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import {
  calendarSyncEvents,
  calendarSyncRules,
  CALENDAR_SYNC_SCOPES,
  folders,
  lists,
  projects,
  spaces,
  taskAssignees,
  tasks,
  userCalendarAccounts,
  type CalendarSyncScope,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { containerVisibilityFilter, isWorkspaceManager, spaceVisibilityFilter } from '../../common/permissions/container-access.guard-helper'
import { folderVisibilityFilter, listVisibilityFilter } from '../../common/permissions/item-visibility'
import { guestFolderFilter, guestListFilter } from '../../common/permissions/guest-reach'
import { isUuid } from '../../common/validation/uuid'
import { CalendarAccountsService } from './calendar-accounts.service'
import { CalendarFailed, CalendarRefused, type EventToWrite } from './calendar-events'
import { calendarOwnerMayRead } from './calendar-owner'

/**
 * CLICKUP'S "SYNC TASKS TO CALENDAR" (`ledger-rows/row-1962`): a person picks a
 * Space, Folder, Project or List and one of their own connected calendars, with
 * all the tasks there or only those assigned to them; the tasks there with a
 * start or due date are written to that calendar as events, kept as the tasks
 * change, and taken off when a task leaves — archived, its dates cleared, moved
 * out, no longer theirs to open, or the sync removed.
 *
 * The planner's Automations page, frame `14:32`: "Sync ClickUp tasks to Google
 * Calendar", "Pick a list, folder, or space…", "+ Add sync". ClickUp's help
 * centre ("Google Calendar integration", through search excerpts): tasks sync
 * from a Space, Folder, Subfolder or List; to a calendar of one's own — "You
 * can't sync tasks to a shared calendar" — and the integration is private, so
 * nobody else reaches a person's calendar through it; all tasks or only those
 * assigned to you; a task needs a start or a due date to be on the calendar, a
 * date with no time is a day's event, and a due date alone begins an hour
 * before it. One way, from the tasks to the calendar.
 *
 * NOTHING SYNCS UNTIL A SYNC IS ADDED. The push wrote every dated task of a
 * workspace into every calendar connected to it, with no table saying where and
 * no switch to stop it; the workspace's connections take no task now.
 *
 * EVERY PUSH ASKS THE READ RULE of the sync's owner, for every task, as the
 * workspace's connections did (`calendarOwnerMayRead`): a sync of a space takes
 * only the tasks there its owner may open now, and nothing once they have left
 * the workspace. A task they may no longer open comes off their calendar.
 */

/** A place a sync draws from, as the picker offers it: in tree order, with the names above it. */
export type SyncPlace = { type: CalendarSyncScope; id: string; name: string; depth: number; path: string[] }

/** What one push did, calendar by calendar (each an account id). */
export type SyncOutcome = { written: string[]; unchanged: string[]; removed: string[]; skipped: string[] }

type AccountRow = typeof userCalendarAccounts.$inferSelect

/** The task as a sync reads it: what the event shows, and where the task is. */
export type TaskForSync = {
  id: string
  title: string
  description: string | null
  startDate: Date | null
  dueDate: Date | null
  startDateHasTime: boolean
  dueDateHasTime: boolean
  isArchived: boolean
  containerArchived: boolean
  listId: string
  projectId: string
  folderId: string | null
  spaceId: string
  workspaceId: string
}

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** UTC midnight of an instant's day: a date picked without a time is stored there (`dueDateHasTime`). */
const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/**
 * WHEN A TASK'S EVENT IS, as ClickUp draws it, or null for a task with no date
 * (which stays off the calendar). A start and a due date span from one to the
 * other — days, when neither carries a time; a due date alone is the hour
 * before it, or its day; a start alone the hour from it, or its day. A start
 * after the due date is not a span, and the due date alone is drawn.
 */
export function taskEventSpan(t: Pick<TaskForSync, 'startDate' | 'dueDate' | 'startDateHasTime' | 'dueDateHasTime'>): {
  start: Date
  end: Date
  allDay: boolean
} | null {
  const due = t.dueDate
  const start = t.startDate && (!due || t.startDate.getTime() <= due.getTime()) ? t.startDate : null
  if (due && start) {
    if (!t.dueDateHasTime && !t.startDateHasTime) {
      return { start: dayStart(start), end: new Date(dayStart(due).getTime() + DAY_MS), allDay: true }
    }
    const from = t.startDateHasTime ? start : dayStart(start)
    const to = t.dueDateHasTime ? due : new Date(dayStart(due).getTime() + DAY_MS)
    return to.getTime() > from.getTime() ? { start: from, end: to, allDay: false } : { start: new Date(to.getTime() - HOUR_MS), end: to, allDay: false }
  }
  if (due) {
    return t.dueDateHasTime
      ? { start: new Date(due.getTime() - HOUR_MS), end: due, allDay: false }
      : { start: dayStart(due), end: new Date(dayStart(due).getTime() + DAY_MS), allDay: true }
  }
  if (t.startDate) {
    const s = t.startDate
    return t.startDateHasTime
      ? { start: s, end: new Date(s.getTime() + HOUR_MS), allDay: false }
      : { start: dayStart(s), end: new Date(dayStart(s).getTime() + DAY_MS), allDay: true }
  }
  return null
}

/** The event a task becomes: its name, its span, and its description with the way back to it; null when it is off the calendar. */
export function taskEvent(t: TaskForSync): EventToWrite | null {
  if (t.isArchived || t.containerArchived) return null
  const span = taskEventSpan(t)
  if (!span) return null
  const base = (process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const link = `${base}/app/${t.workspaceId}/${t.spaceId}/${t.projectId}/${t.listId}?task=${t.id}`
  // As text: an Outlook event's body is written as text, and a tag there is drawn as a tag.
  const text = (t.description ?? '').replace(/<[^>]+>/g, '').trim()
  return { title: t.title, ...span, description: text ? `${text}\n\n${link}` : link }
}

/** What was written, so a change the event does not show writes nothing. */
const fingerprintOf = (e: EventToWrite) =>
  createHash('sha1')
    .update(JSON.stringify([e.title, e.start.toISOString(), e.end.toISOString(), e.allDay, e.description ?? '']))
    .digest('hex')

const KIND: Record<CalendarSyncScope, string> = { space: 'space', folder: 'folder', project: 'project', list: 'list' }
const NOT_FOUND: Record<CalendarSyncScope, string> = {
  space: 'Space not found',
  folder: 'Folder not found',
  project: 'Project not found',
  list: 'List not found',
}

@Injectable()
export class CalendarSyncRulesService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly accounts: CalendarAccountsService,
  ) {}

  /**
   * ONE CALENDAR'S WRITES, ONE AT A TIME. Two pushes of one task — a burst of
   * edits, or an edit during a sync's first fill — would each find no event and
   * each write one; in line, the second finds the first's.
   */
  private readonly queues = new Map<string, Promise<unknown>>()
  private onAccount<T>(accountId: string, work: () => Promise<T>): Promise<T> {
    const before = this.queues.get(accountId) ?? Promise.resolve()
    const next = before.then(work, work)
    const settled = next.then(() => undefined, () => undefined)
    this.queues.set(accountId, settled)
    void settled.then(() => {
      if (this.queues.get(accountId) === settled) this.queues.delete(accountId)
    })
    return next
  }

  // ─── the places a sync may draw from ──────────────────────────────────────

  /**
   * THE PLACES THIS PERSON MAY SYNC: the spaces, folders, projects and lists
   * they may open, in the sidebar's order — the picker's options, and what a
   * new sync is checked against, so the page and the server offer one set.
   * A space's hidden container (`isDefaultContainer`) is never a place; its
   * lists are drawn under the space, as the sidebar draws them.
   */
  async places(workspaceId: string, actorId: string): Promise<SyncPlace[]> {
    const isManager = await isWorkspaceManager(this.db, workspaceId, actorId)
    const spaceRows = await this.db
      .select({ id: spaces.id, name: spaces.name })
      .from(spaces)
      .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isArchived, false), eq(spaces.isPersonal, false), spaceVisibilityFilter(this.db, actorId, isManager)))
      .orderBy(asc(spaces.createdAt), asc(spaces.id))
    if (spaceRows.length === 0) return []
    const spaceIds = spaceRows.map((s) => s.id)
    const folderRows = await this.db
      .select({ id: folders.id, name: folders.name, spaceId: folders.spaceId })
      .from(folders)
      .where(and(
        inArray(folders.spaceId, spaceIds),
        eq(folders.isArchived, false),
        folderVisibilityFilter(actorId, isManager),
        isManager ? undefined : guestFolderFilter(this.db, actorId),
      ))
      .orderBy(asc(folders.position), asc(folders.createdAt))
    const projectRows = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        spaceId: projects.spaceId,
        folderId: projects.folderId,
        hidden: projects.isDefaultContainer,
      })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(inArray(projects.spaceId, spaceIds), eq(projects.isArchived, false), containerVisibilityFilter(this.db, actorId, isManager)))
      .orderBy(asc(projects.position), asc(projects.id))
    const visibleFolders = new Set(folderRows.map((f) => f.id))
    // A project in a folder this person cannot see (or one in the bin) is not on the way to anything here.
    const reachable = projectRows.filter((p) => !p.folderId || visibleFolders.has(p.folderId))
    const listRows = reachable.length
      ? await this.db
          .select({ id: lists.id, name: lists.name, projectId: lists.projectId })
          .from(lists)
          .where(and(
            inArray(lists.projectId, reachable.map((p) => p.id)),
            eq(lists.isArchived, false),
            listVisibilityFilter(actorId, isManager),
            isManager ? undefined : guestListFilter(this.db, actorId),
          ))
          .orderBy(asc(lists.position), asc(lists.id))
      : []

    const out: SyncPlace[] = []
    const listsOf = (projectId: string) => listRows.filter((l) => l.projectId === projectId)
    const project = (p: (typeof reachable)[number], depth: number, path: string[]) => {
      out.push({ type: 'project', id: p.id, name: p.name, depth, path })
      for (const l of listsOf(p.id)) out.push({ type: 'list', id: l.id, name: l.name, depth: depth + 1, path: [...path, p.name] })
    }
    for (const s of spaceRows) {
      out.push({ type: 'space', id: s.id, name: s.name, depth: 0, path: [] })
      for (const f of folderRows.filter((f) => f.spaceId === s.id)) {
        out.push({ type: 'folder', id: f.id, name: f.name, depth: 1, path: [s.name] })
        for (const p of reachable.filter((p) => p.folderId === f.id && !p.hidden)) project(p, 2, [s.name, f.name])
      }
      for (const p of reachable.filter((p) => p.spaceId === s.id && !p.folderId && !p.hidden)) project(p, 1, [s.name])
      for (const p of reachable.filter((p) => p.spaceId === s.id && p.hidden)) {
        for (const l of listsOf(p.id)) out.push({ type: 'list', id: l.id, name: l.name, depth: 1, path: [s.name] })
      }
    }
    return out
  }

  /** Whether a place of this kind and id is in this workspace at all, whoever may open it. */
  private async placeExists(workspaceId: string, type: CalendarSyncScope, id: string): Promise<boolean> {
    const one = async (q: Promise<unknown[]>) => (await q).length > 0
    switch (type) {
      case 'space':
        return one(this.db.select({ id: spaces.id }).from(spaces).where(and(eq(spaces.id, id), eq(spaces.workspaceId, workspaceId))).limit(1))
      case 'folder':
        return one(this.db.select({ id: folders.id }).from(folders).innerJoin(spaces, eq(spaces.id, folders.spaceId))
          .where(and(eq(folders.id, id), eq(spaces.workspaceId, workspaceId))).limit(1))
      case 'project':
        return one(this.db.select({ id: projects.id }).from(projects).innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(and(eq(projects.id, id), eq(spaces.workspaceId, workspaceId))).limit(1))
      case 'list':
        return one(this.db.select({ id: lists.id }).from(lists).innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId)).where(and(eq(lists.id, id), eq(spaces.workspaceId, workspaceId))).limit(1))
    }
  }

  // ─── a person's syncs ─────────────────────────────────────────────────────

  /**
   * THIS PERSON'S SYNCS, and theirs alone: a sync names one of their calendars,
   * and a colleague's are not theirs to read. Each with its place as they may
   * open it now — `place: null` when it is gone or no longer theirs to open,
   * which the page says rather than drawing an empty name.
   */
  async listRules(workspaceId: string, actorId: string) {
    const rows = await this.db
      .select({
        id: calendarSyncRules.id,
        scopeType: calendarSyncRules.scopeType,
        scopeId: calendarSyncRules.scopeId,
        assignedOnly: calendarSyncRules.assignedOnly,
        createdAt: calendarSyncRules.createdAt,
        accountId: calendarSyncRules.accountId,
        provider: userCalendarAccounts.provider,
        email: userCalendarAccounts.externalAccountEmail,
        status: userCalendarAccounts.status,
      })
      .from(calendarSyncRules)
      .innerJoin(userCalendarAccounts, eq(userCalendarAccounts.id, calendarSyncRules.accountId))
      .where(and(eq(calendarSyncRules.workspaceId, workspaceId), eq(calendarSyncRules.userId, actorId)))
      .orderBy(asc(calendarSyncRules.createdAt), asc(calendarSyncRules.id))
    const places = rows.length ? await this.places(workspaceId, actorId) : []
    return rows.map((r) => {
      const place = places.find((p) => p.type === r.scopeType && p.id === r.scopeId)
      return {
        id: r.id,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
        assignedOnly: r.assignedOnly,
        createdAt: r.createdAt,
        account: { id: r.accountId, provider: r.provider, email: r.email, status: r.status },
        place: place ? { name: place.name, path: place.path } : null,
      }
    })
  }

  /**
   * ADD A SYNC: a place this person may open, to one of their own calendars in
   * this workspace. A colleague's calendar is not found (whether they have one
   * is not this person's to learn); a place they may not open is refused,
   * saying so, as a read of it is; the same place twice to one calendar is
   * refused, since it would write nothing new. The tasks already there are
   * written once it is made, after the answer.
   */
  async addRule(
    workspaceId: string,
    actorId: string,
    body: { scopeType?: unknown; scopeId?: unknown; accountId?: unknown; assignedOnly?: unknown },
  ) {
    const scopeType = body?.scopeType
    if (typeof scopeType !== 'string' || !(CALENDAR_SYNC_SCOPES as readonly string[]).includes(scopeType)) {
      throw new BadRequestException('Pick a space, folder, project or list to sync')
    }
    const type = scopeType as CalendarSyncScope
    const scopeId = body.scopeId
    if (typeof scopeId !== 'string' || !isUuid(scopeId)) throw new BadRequestException('Pick a space, folder, project or list to sync')
    const accountId = body.accountId
    if (typeof accountId !== 'string' || !isUuid(accountId)) throw new BadRequestException('Pick one of your calendars to sync to')
    if (body.assignedOnly !== undefined && typeof body.assignedOnly !== 'boolean') {
      throw new BadRequestException('assignedOnly must be true or false')
    }
    const [account] = await this.db
      .select({ id: userCalendarAccounts.id })
      .from(userCalendarAccounts)
      .where(and(
        eq(userCalendarAccounts.id, accountId),
        eq(userCalendarAccounts.userId, actorId),
        eq(userCalendarAccounts.workspaceId, workspaceId),
      ))
      .limit(1)
    if (!account) throw new NotFoundException('Calendar account not found')
    const places = await this.places(workspaceId, actorId)
    if (!places.some((p) => p.type === type && p.id === scopeId)) {
      if (await this.placeExists(workspaceId, type, scopeId)) {
        throw new ForbiddenException(`You cannot open that ${KIND[type]}, so its tasks cannot be synced to your calendar`)
      }
      throw new NotFoundException(NOT_FOUND[type])
    }
    const [rule] = await this.db
      .insert(calendarSyncRules)
      .values({ workspaceId, userId: actorId, accountId, scopeType: type, scopeId, assignedOnly: body.assignedOnly === true })
      .onConflictDoNothing()
      .returning()
    if (!rule) throw new ConflictException('That calendar already syncs this place')
    void this.fill(rule.scopeType, rule.scopeId).catch(() => undefined)
    return (await this.listRules(workspaceId, actorId)).find((r) => r.id === rule.id)
  }

  /**
   * REMOVE A SYNC, one of this person's own; a colleague's is not found. Its
   * events come off the calendar, but for the tasks another of that calendar's
   * syncs still holds, after the answer.
   */
  async removeRule(workspaceId: string, actorId: string, ruleId: string) {
    if (!isUuid(ruleId)) throw new NotFoundException('Sync not found')
    const [rule] = await this.db
      .delete(calendarSyncRules)
      .where(and(eq(calendarSyncRules.id, ruleId), eq(calendarSyncRules.userId, actorId), eq(calendarSyncRules.workspaceId, workspaceId)))
      .returning()
    if (!rule) throw new NotFoundException('Sync not found')
    void this.refreshAccount(rule.accountId).catch(() => undefined)
    return { ok: true }
  }

  /** The ids of a place's dated tasks, not archived: what a sync of it holds. */
  private async datedTasksOf(type: CalendarSyncScope, id: string): Promise<string[]> {
    const where: Record<CalendarSyncScope, SQL> = {
      list: eq(tasks.listId, id),
      project: eq(lists.projectId, id),
      folder: eq(projects.folderId, id),
      space: eq(projects.spaceId, id),
    }
    const rows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .where(and(where[type], eq(tasks.isArchived, false), or(isNotNull(tasks.dueDate), isNotNull(tasks.startDate))))
    return rows.map((r) => r.id)
  }

  /** The dated tasks of a place, each pushed: a new sync's first fill. */
  private async fill(type: CalendarSyncScope, id: string) {
    for (const taskId of await this.datedTasksOf(type, id)) await this.syncTask(taskId).catch(() => undefined)
  }

  /**
   * THE PLANNER'S "SYNC NOW" (`ledger-rows/row-1904`, frame `14:36`): this
   * person's syncs written through again, into their own calendars and no
   * one else's. Every task their syncs hold, and every task with an event in
   * their calendars, is pushed with the event written whether or not it
   * looks changed — so an event deleted in the calendar is written again, and
   * one the calendar changed is put back as the task says — and what no sync
   * holds any more comes off. The page reads the calendars' events again
   * beside it. Answers how many tasks it went through and what it did.
   */
  async syncNow(workspaceId: string, actorId: string) {
    const mine = await this.db
      .select({ id: userCalendarAccounts.id })
      .from(userCalendarAccounts)
      .where(and(eq(userCalendarAccounts.userId, actorId), eq(userCalendarAccounts.workspaceId, workspaceId)))
    const accounts = new Set(mine.map((a) => a.id))
    const total = { tasks: 0, written: 0, removed: 0, unchanged: 0, failed: 0 }
    if (accounts.size === 0) return total
    const rules = await this.db
      .select({ scopeType: calendarSyncRules.scopeType, scopeId: calendarSyncRules.scopeId })
      .from(calendarSyncRules)
      .where(and(eq(calendarSyncRules.workspaceId, workspaceId), eq(calendarSyncRules.userId, actorId)))
    const taskIds = new Set<string>()
    for (const rule of rules) for (const id of await this.datedTasksOf(rule.scopeType, rule.scopeId)) taskIds.add(id)
    const written = await this.db
      .select({ taskId: calendarSyncEvents.taskId })
      .from(calendarSyncEvents)
      .where(inArray(calendarSyncEvents.accountId, [...accounts]))
    for (const row of written) taskIds.add(row.taskId)
    total.tasks = taskIds.size
    for (const taskId of taskIds) {
      const out = await this.syncTask(taskId, { accounts, force: true })
      total.written += out.written.length
      total.removed += out.removed.length
      total.unchanged += out.unchanged.length
      total.failed += out.skipped.length
    }
    return total
  }

  /** Every task with an event in this calendar, pushed again: what a removed sync leaves is taken off. */
  private async refreshAccount(accountId: string) {
    const rows = await this.db
      .select({ taskId: calendarSyncEvents.taskId })
      .from(calendarSyncEvents)
      .where(eq(calendarSyncEvents.accountId, accountId))
    for (const row of rows) await this.syncTask(row.taskId).catch(() => undefined)
  }

  // ─── the push ─────────────────────────────────────────────────────────────

  private async taskForSync(taskId: string): Promise<TaskForSync | null> {
    if (!isUuid(taskId)) return null
    const [row] = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        startDateHasTime: tasks.startDateHasTime,
        dueDateHasTime: tasks.dueDateHasTime,
        isArchived: tasks.isArchived,
        listArchived: lists.isArchived,
        projectArchived: projects.isArchived,
        spaceArchived: spaces.isArchived,
        listId: tasks.listId,
        projectId: projects.id,
        folderId: projects.folderId,
        spaceId: projects.spaceId,
        workspaceId: spaces.workspaceId,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!row) return null
    const { listArchived, projectArchived, spaceArchived, ...task } = row
    return { ...task, containerArchived: listArchived || projectArchived || spaceArchived }
  }

  /** Whether a sync's owner may take this task now: the read rule of their calendar (`calendarOwnerMayRead`). */
  private mayTake(userId: string, task: TaskForSync): Promise<boolean> {
    return calendarOwnerMayRead(this.db, userId, task)
  }

  /** The syncs whose place holds this task: its list, its project, its folder or its space. */
  private async rulesFor(task: TaskForSync) {
    return this.db
      .select()
      .from(calendarSyncRules)
      .where(and(
        eq(calendarSyncRules.workspaceId, task.workspaceId),
        or(
          and(eq(calendarSyncRules.scopeType, 'list'), eq(calendarSyncRules.scopeId, task.listId)),
          and(eq(calendarSyncRules.scopeType, 'project'), eq(calendarSyncRules.scopeId, task.projectId)),
          task.folderId ? and(eq(calendarSyncRules.scopeType, 'folder'), eq(calendarSyncRules.scopeId, task.folderId)) : undefined,
          and(eq(calendarSyncRules.scopeType, 'space'), eq(calendarSyncRules.scopeId, task.spaceId)),
        ),
      ))
      .orderBy(asc(calendarSyncRules.createdAt))
  }

  /**
   * PUSH ONE TASK: written to every calendar a sync of its place names, whose
   * owner may open it now (and to whom it is assigned, where the sync says
   * only theirs), and taken off every calendar it was written to that no sync
   * holds it for any more. Best effort, calendar by calendar: one that refuses
   * costs only its own event, and is said in `skipped`.
   */
  async syncTask(taskId: string, opts: { accounts?: Set<string>; force?: boolean } = {}): Promise<SyncOutcome> {
    const outcome: SyncOutcome = { written: [], unchanged: [], removed: [], skipped: [] }
    // Sync now's: only these calendars, each event written whether or not it looks changed.
    const only = (accountId: string) => !opts.accounts || opts.accounts.has(accountId)
    const task = await this.taskForSync(taskId)
    const wanted = new Map<string, { account: AccountRow; event: EventToWrite; fingerprint: string }>()
    const event = task ? taskEvent(task) : null
    if (task && event) {
      const rules = await this.rulesFor(task)
      if (rules.length > 0) {
        const accounts = await this.db
          .select()
          .from(userCalendarAccounts)
          .where(inArray(userCalendarAccounts.id, [...new Set(rules.map((r) => r.accountId))]))
        const assignees = new Set(
          (await this.db.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, task.id))).map((a) => a.userId),
        )
        const mayRead = new Map<string, boolean>()
        const fingerprint = fingerprintOf(event)
        for (const rule of rules) {
          if (wanted.has(rule.accountId) || !only(rule.accountId)) continue
          const account = accounts.find((a) => a.id === rule.accountId)
          // A sync names one of its owner's own calendars in its own workspace, and nothing else.
          if (!account || account.userId !== rule.userId || account.workspaceId !== task.workspaceId) continue
          if (rule.assignedOnly && !assignees.has(rule.userId)) continue
          if (!mayRead.has(rule.userId)) mayRead.set(rule.userId, await this.mayTake(rule.userId, task))
          if (!mayRead.get(rule.userId)) continue
          if (account.status !== 'connected') {
            if (!outcome.skipped.includes(`${account.id}:not-connected`)) outcome.skipped.push(`${account.id}:not-connected`)
            continue
          }
          wanted.set(account.id, { account, event, fingerprint })
        }
      }
    }
    const had = await this.db.select().from(calendarSyncEvents).where(eq(calendarSyncEvents.taskId, taskId))
    const leaving = had.filter((e) => !wanted.has(e.accountId) && only(e.accountId))
    const leavingAccounts = leaving.length
      ? await this.db.select().from(userCalendarAccounts).where(inArray(userCalendarAccounts.id, leaving.map((e) => e.accountId)))
      : []
    await Promise.all([
      ...[...wanted.values()].map((w) => this.onAccount(w.account.id, () => this.write(w, taskId, outcome, opts.force === true))),
      ...leavingAccounts.map((a) => this.onAccount(a.id, () => this.takeOff(a, taskId, outcome))),
    ])
    return outcome
  }

  private async write(
    w: { account: AccountRow; event: EventToWrite; fingerprint: string },
    taskId: string,
    outcome: SyncOutcome,
    force = false,
  ) {
    const [row] = await this.db
      .select()
      .from(calendarSyncEvents)
      .where(and(eq(calendarSyncEvents.accountId, w.account.id), eq(calendarSyncEvents.taskId, taskId)))
      .limit(1)
    if (row && row.fingerprint === w.fingerprint && !force) {
      outcome.unchanged.push(w.account.id)
      return
    }
    try {
      let eventId: string
      try {
        eventId = await this.accounts.writeBlockEvent(w.account, w.event, row?.externalEventId ?? null)
      } catch (err) {
        // Deleted on the calendar's side: written again, as the task still is.
        if (!(row && err instanceof CalendarFailed && (err.status === 404 || err.status === 410))) throw err
        eventId = await this.accounts.writeBlockEvent(w.account, w.event, null)
      }
      if (row) {
        await this.db
          .update(calendarSyncEvents)
          .set({ externalEventId: eventId, fingerprint: w.fingerprint, syncedAt: new Date() })
          .where(eq(calendarSyncEvents.id, row.id))
      } else {
        const [made] = await this.db
          .insert(calendarSyncEvents)
          .values({ accountId: w.account.id, taskId, externalEventId: eventId, fingerprint: w.fingerprint })
          .onConflictDoNothing()
          .returning({ id: calendarSyncEvents.id })
        // Another process wrote this task's event first: this one is a second copy.
        if (!made) await this.accounts.deleteBlockEvent(w.account, eventId).catch(() => undefined)
      }
      outcome.written.push(w.account.id)
    } catch (err) {
      outcome.skipped.push(`${w.account.id}:${err instanceof CalendarRefused ? 'refused' : 'failed'}`)
    }
  }

  private async takeOff(account: AccountRow, taskId: string, outcome: SyncOutcome) {
    const [row] = await this.db
      .select()
      .from(calendarSyncEvents)
      .where(and(eq(calendarSyncEvents.accountId, account.id), eq(calendarSyncEvents.taskId, taskId)))
      .limit(1)
    if (!row) return
    try {
      await this.accounts.deleteBlockEvent(account, row.externalEventId)
    } catch (err) {
      // Kept, so the next push of the task tries again.
      outcome.skipped.push(`${account.id}:${err instanceof CalendarRefused ? 'refused' : 'failed'}`)
      return
    }
    await this.db.delete(calendarSyncEvents).where(eq(calendarSyncEvents.id, row.id))
    outcome.removed.push(account.id)
  }
}
