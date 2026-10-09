import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, gte, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm'
import {
  lists, projects, spaces, taskActivity, taskViewEvents, tasks, userPriorities, users,
  workspaceGroupMembers, workspaceGroups, workspaceMembers, workspaces,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { FLAGS } from '@rundesk/feature-flags'
import { DB_TOKEN } from '../../common/database/database.module'
import { isAdminRole } from '../../common/permissions/workspace-roles'
import { taskReadFilterFor } from '../../common/permissions/viewer-scope'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import { CustomRolesService } from '../custom-roles/custom-roles.service'
import { PresenceService } from '../presence/presence.service'

/**
 * THE TEAMS HUB'S ANALYTICS — ClickUp's (formerly Pulse), through its help
 * centre's "View analytics for your organization" and its feedback board
 * (search excerpts, 8 October; `ledger-rows/section3-team-analytics`):
 *
 *   · each member's online status and overall activity, the tasks they viewed
 *     (task views are logged) and their most-viewed tasks, a roll-up by team,
 *     and the Lineup — a task landing in somebody's priority queue;
 *   · a period moved by arrows, or a date or range picked; a name searched;
 *   · a ClickApp an owner or admin turns on, and an audience they set on the
 *     page: everyone but guests, or owners and admins only. Never guests.
 *
 * Here: the ClickApp is `teams.analytics` (off until turned on, by those who
 * hold `workspace.clickapps.manage`); the audience is the workspace's
 * `analytics_audience`; activity is the person's entries in the tasks'
 * activity log; views are `task_view_events`, written when a task's sheet
 * opens; the Lineup is the tasks put on their Personal Priorities. A
 * person's most-viewed tasks are those the READER may open, so a private task
 * is not named to somebody who cannot see it; the counts are the person's own.
 */
export const ANALYTICS_AUDIENCES = ['members', 'admins'] as const
export type AnalyticsAudience = (typeof ANALYTICS_AUDIENCES)[number]

export const ANALYTICS_REFUSALS = {
  guest: 'Analytics is not open to guests',
  admins: "Analytics is open to this workspace's owners and admins only",
  notMember: 'You are not a member of this workspace',
} as const

const DAY_MS = 86_400_000
/** A period is a quarter at most: past that the page is a report, not a pulse. */
export const ANALYTICS_MAX_DAYS = 92
/** How many of a person's most-viewed tasks are named. */
const MOST_VIEWED = 3

/** The period asked for: `from` and `to` as dates, the last seven days when neither is said. */
export function readAnalyticsRange(
  fromRaw: unknown,
  toRaw: unknown,
  now: Date = new Date(),
): { ok: true; from: Date; to: Date } | { ok: false; reason: string } {
  const parse = (raw: unknown) => (typeof raw === 'string' && raw.trim() !== '' ? new Date(raw) : null)
  const toParsed = parse(toRaw)
  const fromParsed = parse(fromRaw)
  if ((toRaw !== undefined && toParsed === null) || (fromRaw !== undefined && fromParsed === null)) {
    return { ok: false, reason: 'from and to must be dates' }
  }
  const to = toParsed ?? now
  const from = fromParsed ?? new Date(to.getTime() - 7 * DAY_MS)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { ok: false, reason: 'from and to must be dates' }
  if (from.getTime() >= to.getTime()) return { ok: false, reason: 'from must be before to' }
  if (to.getTime() - from.getTime() > ANALYTICS_MAX_DAYS * DAY_MS) {
    return { ok: false, reason: `A period is ${ANALYTICS_MAX_DAYS} days at most` }
  }
  return { ok: true, from, to }
}

type Reader = { id: string; role?: string | null }

@Injectable()
export class TeamAnalyticsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly flags: FeatureFlagsService,
    private readonly customRoles: CustomRolesService,
  ) {}

  /**
   * Who is asking, and what they may do here: refused if no member or a
   * guest; `mayManage` — turn the ClickApp on or off and set the audience —
   * for those who hold `workspace.clickapps.manage`, as the ClickApps tab asks.
   */
  private async reader(workspaceId: string, reader: Reader) {
    const [ws] = await this.db
      .select({ audience: workspaces.analyticsAudience })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    if (!ws) throw new NotFoundException('Workspace not found')
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, reader.id)))
      .limit(1)
    const superAdmin = reader.role === 'super_admin'
    if (!membership && !superAdmin) throw new ForbiddenException(ANALYTICS_REFUSALS.notMember)
    if (membership?.role === 'guest' && !superAdmin) throw new ForbiddenException(ANALYTICS_REFUSALS.guest)
    const isAdmin = superAdmin || isAdminRole(membership?.role)
    const mayManage = isAdmin || (await this.customRoles.hasPermission(workspaceId, reader.id, 'workspace.clickapps.manage'))
    return { audience: (ws.audience as AnalyticsAudience) ?? 'members', isAdmin, mayManage }
  }

  async getAnalytics(workspaceId: string, reader: Reader, range: { from: Date; to: Date }) {
    const who = await this.reader(workspaceId, reader)
    const enabled = await this.flags.isEnabled(FLAGS.TEAMS_ANALYTICS, { workspaceId, userId: reader.id, role: reader.role ?? '' })
    const base = {
      enabled,
      audience: who.audience,
      mayManage: who.mayManage,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    }
    if (!enabled) return { ...base, people: [], teams: [] }
    if (who.audience === 'admins' && !who.isAdmin) throw new ForbiddenException(ANALYTICS_REFUSALS.admins)

    const { from, to } = range
    // Everybody of the workspace but its guests, who are no part of a team's pulse.
    const people = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: workspaceMembers.role,
        presenceStatus: users.presenceStatus,
        lastSeenAt: users.lastSeenAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.role, 'guest')))
    const ids = people.map((p) => p.userId)
    if (ids.length === 0) return { ...base, people: [], teams: [] }

    // Activity: their entries in this workspace's tasks' activity log, in the period.
    const actionRows = await this.db
      .select({ userId: taskActivity.actorId, n: sql<number>`count(*)::int` })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(
        eq(spaces.workspaceId, workspaceId),
        inArray(taskActivity.actorId, ids),
        gte(taskActivity.createdAt, from),
        lt(taskActivity.createdAt, to),
      ))
      .groupBy(taskActivity.actorId)
    const actions = new Map(actionRows.map((r) => [r.userId as string, r.n]))

    // Views: the task sheets they opened here, in the period.
    const viewRows = await this.db
      .select({ userId: taskViewEvents.userId, n: sql<number>`count(*)::int` })
      .from(taskViewEvents)
      .where(and(
        eq(taskViewEvents.workspaceId, workspaceId),
        inArray(taskViewEvents.userId, ids),
        gte(taskViewEvents.viewedAt, from),
        lt(taskViewEvents.viewedAt, to),
      ))
      .groupBy(taskViewEvents.userId)
    const views = new Map(viewRows.map((r) => [r.userId, r.n]))

    // Most viewed: by each person, of the tasks the READER may open.
    const readable = await taskReadFilterFor(this.db, workspaceId, { id: reader.id, role: reader.role })
    const viewCount = sql<number>`count(*)::int`
    const mostRows = await this.db
      .select({ userId: taskViewEvents.userId, taskId: tasks.id, title: tasks.title, n: viewCount })
      .from(taskViewEvents)
      .innerJoin(tasks, eq(tasks.id, taskViewEvents.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(
        eq(taskViewEvents.workspaceId, workspaceId),
        eq(spaces.workspaceId, workspaceId),
        inArray(taskViewEvents.userId, ids),
        gte(taskViewEvents.viewedAt, from),
        lt(taskViewEvents.viewedAt, to),
        eq(tasks.isArchived, false),
        readable,
      ))
      .groupBy(taskViewEvents.userId, tasks.id, tasks.title)
      .orderBy(desc(viewCount), tasks.title)
    const mostViewed = new Map<string, Array<{ taskId: string; title: string; views: number }>>()
    for (const r of mostRows) {
      const list = mostViewed.get(r.userId) ?? []
      if (list.length < MOST_VIEWED) list.push({ taskId: r.taskId, title: r.title, views: r.n })
      mostViewed.set(r.userId, list)
    }

    // Lineup: the tasks put on their Personal Priorities in the period.
    const lineupRows = await this.db
      .select({ userId: userPriorities.userId, n: sql<number>`count(*)::int` })
      .from(userPriorities)
      .where(and(
        eq(userPriorities.workspaceId, workspaceId),
        inArray(userPriorities.userId, ids),
        isNotNull(userPriorities.taskId),
        gte(userPriorities.createdAt, from),
        lt(userPriorities.createdAt, to),
      ))
      .groupBy(userPriorities.userId)
    const lineup = new Map(lineupRows.map((r) => [r.userId, r.n]))

    const now = new Date()
    const rows = people
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName || p.email,
        email: p.email,
        avatarUrl: p.avatarUrl,
        role: p.role,
        status: PresenceService.resolveStatus(p.presenceStatus, p.lastSeenAt, now),
        lastSeenAt: p.lastSeenAt,
        actions: actions.get(p.userId) ?? 0,
        views: views.get(p.userId) ?? 0,
        lineup: lineup.get(p.userId) ?? 0,
        mostViewed: mostViewed.get(p.userId) ?? [],
      }))
      .sort((a, b) => b.actions + b.views - (a.actions + a.views) || a.displayName.localeCompare(b.displayName))

    // The roll-up by team: each team's members here, and their activity and views summed.
    const groupRows = await this.db
      .select({ groupId: workspaceGroups.id, name: workspaceGroups.name, userId: workspaceGroupMembers.userId })
      .from(workspaceGroups)
      .leftJoin(workspaceGroupMembers, eq(workspaceGroupMembers.groupId, workspaceGroups.id))
      .where(eq(workspaceGroups.workspaceId, workspaceId))
    const byId = new Map(rows.map((r) => [r.userId, r]))
    const teams = new Map<string, { groupId: string; name: string; members: number; actions: number; views: number }>()
    for (const g of groupRows) {
      const team = teams.get(g.groupId) ?? { groupId: g.groupId, name: g.name, members: 0, actions: 0, views: 0 }
      const person = g.userId ? byId.get(g.userId) : undefined
      if (person) {
        team.members += 1
        team.actions += person.actions
        team.views += person.views
      }
      teams.set(g.groupId, team)
    }

    return { ...base, people: rows, teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)) }
  }

  /** The audience, set by those who may turn the ClickApp on or off. */
  async setAudience(workspaceId: string, reader: Reader, raw: unknown) {
    const audience = (raw as { audience?: unknown } | null)?.audience
    if (typeof audience !== 'string' || !(ANALYTICS_AUDIENCES as readonly string[]).includes(audience)) {
      throw new BadRequestException(`audience must be one of: ${ANALYTICS_AUDIENCES.join(', ')}`)
    }
    const who = await this.reader(workspaceId, reader)
    if (!who.mayManage) throw new ForbiddenException('Setting who sees Analytics takes the Manage ClickApps permission')
    await this.db.update(workspaces).set({ analyticsAudience: audience }).where(eq(workspaces.id, workspaceId))
    return { ok: true, audience }
  }
}
