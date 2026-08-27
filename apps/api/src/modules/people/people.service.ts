import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql, ilike } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  users,
  workspaceMembers,
  workspaceGroups,
  workspaceGroupMembers,
  tasks,
  taskAssignees,
  taskActivity,
  taskComments,
  lists,
  projects,
  spaces,
  meetings,
  meetingAttendees,
  userPriorities,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { PresenceService } from '../presence/presence.service'

/**
 * §G06 [05:35–06:35] — the person profile panel.
 *
 * > "Yeh meri PROFILE hai; yeh mujhe show karti hai ke meri ACTIVITY kya hai,
 * > meri EMAIL kya hai, mera TIME ZONE kya chal raha hai, main kis ki TEAM
 * > MEMBER hoon … meri PRIORITIES kya hain … COMMENTS … CALENDAR … aur yahan
 * > mujhe ORGANIZATION CHART show ho jayega"
 *
 * A full minute on one panel, and six of the 157 gaps live in it. What she
 * describes is not our `/app/profile`, which is an account-settings form —
 * password, sessions, 2FA, danger zone. Same word, different page.
 *
 * This module answers one question — *who is this person and what are they
 * working on* — for anybody in the workspace, about anybody in it.
 *
 * Most of the data already existed and was simply unreachable by actor:
 * activity was queryable by task, by project and workspace-wide but never by
 * who did it; the org chart was an indented text list inside Workspace
 * Settings → Members; timezone was stored, used for quiet hours, and never
 * selected by the roster read. Priorities are the only genuinely new thing,
 * because they are the only part that is a decision rather than a derivation.
 */
@Injectable()
export class PeopleService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * Both people must be in the workspace.
   *
   * A profile panel is a directory entry, so any colleague may open it — but
   * "any colleague" means exactly that, and the check is on the reader as well
   * as the subject. Without the second half, a member of workspace A could
   * read a profile from workspace B by guessing an id.
   */
  private async assertBothMembers(workspaceId: string, requesterId: string, userId: string) {
    const rows = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.userId, [...new Set([requesterId, userId])]),
        ),
      )
    const found = new Set(rows.map((r) => r.userId))
    if (!found.has(requesterId)) throw new ForbiddenException('Workspace membership required')
    if (!found.has(userId)) throw new NotFoundException('That person is not in this workspace')
  }

  /**
   * §G06 [05:43] — the panel's header and its three derived sections.
   *
   * One request rather than six. The panel opens over whatever you were doing,
   * so it has one moment to be useful; six round trips is six chances to show
   * a half-drawn card, which is the §2.9a complaint in miniature.
   */
  async getProfile(workspaceId: string, requesterId: string, userId: string) {
    await this.assertBothMembers(workspaceId, requesterId, userId)

    const [person] = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        // §G06 [05:46] — "mera TIME ZONE kya chal raha hai".
        timezone: users.timezone,
        lastSeenAt: users.lastSeenAt,
        presenceStatus: users.presenceStatus,
        statusEmoji: users.statusEmoji,
        statusText: users.statusText,
        statusExpiresAt: users.statusExpiresAt,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
        managerId: workspaceMembers.managerId,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!person) throw new NotFoundException('That person is not in this workspace')

    // §G06 [05:43] — "main kis ki TEAM MEMBER hoon".
    const teams = await this.db
      .select({ id: workspaceGroups.id, name: workspaceGroups.name, alias: workspaceGroups.alias })
      .from(workspaceGroupMembers)
      .innerJoin(workspaceGroups, eq(workspaceGroups.id, workspaceGroupMembers.groupId))
      .where(
        and(eq(workspaceGroupMembers.userId, userId), eq(workspaceGroups.workspaceId, workspaceId)),
      )
      .orderBy(asc(workspaceGroups.name))

    /*
     * §G06 [06:28] — "yahan mujhe ORGANIZATION CHART show ho jayega".
     *
     * One person's reporting line, not the whole tree: who they report to, and
     * who reports to them. The full chart is a different screen and already
     * exists in settings; what belongs on a person is their own line, and a
     * "No manager" answer when there isn't one — which is a fact worth
     * rendering rather than an empty space.
     */
    const manager = person.managerId
      ? (
          await this.db
            .select({
              id: users.id,
              displayName: users.displayName,
              avatarUrl: users.avatarUrl,
              role: workspaceMembers.role,
            })
            .from(workspaceMembers)
            .innerJoin(users, eq(users.id, workspaceMembers.userId))
            .where(
              and(
                eq(workspaceMembers.workspaceId, workspaceId),
                eq(workspaceMembers.userId, person.managerId),
              ),
            )
            .limit(1)
        )[0] ?? null
      : null

    const reports = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.managerId, userId)))
      .orderBy(asc(users.displayName))

    // What they are working on: open tasks assigned to them, soonest due first.
    const assigned = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        listId: tasks.listId,
        listName: lists.name,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(taskAssignees.userId, userId),
          eq(spaces.workspaceId, workspaceId),
          ne(tasks.status, 'done'),
        ),
      )
      // Nulls last: a task with a date is more urgent than one without, and
      // Postgres sorts NULL first ascending by default, which would put every
      // undated task above everything that is actually due.
      .orderBy(sql`${tasks.dueDate} asc nulls last`)
      .limit(25)

    return {
      person: {
        ...person,
        // The same expiry rule every other reader applies.
        customStatus: PresenceService.liveStatus(person),
        status: PresenceService.resolveStatus(person.presenceStatus, person.lastSeenAt),
      },
      teams,
      reporting: { manager, reports },
      assignedTasks: assigned,
    }
  }

  /**
   * §G06 [06:00] — "jis jis task ko open kiya hoga, jis document pe kaam kiya
   * hoga — bas woh yahan pe show honge", with a search box on the feed.
   *
   * Activity was queryable by task, by project and workspace-wide, and never
   * by who did it — so the one question a profile panel exists to answer had
   * no query behind it. This is that query, scoped to the workspace so the
   * feed cannot leak a task from somewhere the reader has no business.
   */
  async getActivity(
    workspaceId: string,
    requesterId: string,
    userId: string,
    opts: { q?: string; limit?: number } = {},
  ) {
    await this.assertBothMembers(workspaceId, requesterId, userId)
    const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100)
    const q = opts.q?.trim()

    const conditions = [
      eq(taskActivity.actorId, userId),
      eq(spaces.workspaceId, workspaceId),
    ]
    // The search icon on the frame's feed header. Matched against the task
    // title, which is the only text on an activity row a person would search.
    if (q) conditions.push(ilike(tasks.title, `%${q}%`))

    const rows = await this.db
      .select({
        id: taskActivity.id,
        action: taskActivity.action,
        meta: taskActivity.meta,
        createdAt: taskActivity.createdAt,
        taskId: tasks.id,
        taskTitle: tasks.title,
        listId: tasks.listId,
        listName: lists.name,
        spaceId: spaces.id,
        projectId: projects.id,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(...conditions))
      .orderBy(desc(taskActivity.createdAt))
      .limit(limit)

    return rows
  }

  /**
   * §G06 [06:22] — "CALENDAR — mera hi calendar show ho sakta hai".
   *
   * A person's own calendar, which did not exist as a surface: the only
   * calendar views were per-list, so there was no way to ask "what does this
   * week look like for them". Two sources, because two things occupy a day —
   * their dated tasks and the meetings they are in.
   *
   * Google/Outlook sync already writes into these same tables, so a synced
   * calendar shows up here without this module knowing anything about it.
   */
  async getCalendar(
    workspaceId: string,
    requesterId: string,
    userId: string,
    opts: { from?: string; to?: string } = {},
  ) {
    await this.assertBothMembers(workspaceId, requesterId, userId)

    const from = opts.from ? new Date(opts.from) : new Date()
    const to = opts.to ? new Date(opts.to) : new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('from/to must be valid dates')
    }
    if (to.getTime() < from.getTime()) throw new BadRequestException('to must be after from')

    const dated = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        listId: tasks.listId,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(taskAssignees.userId, userId),
          eq(spaces.workspaceId, workspaceId),
          // A task counts as inside the window if either end of it is.
          or(
            and(gte(tasks.dueDate, from), lte(tasks.dueDate, to)),
            and(gte(tasks.startDate, from), lte(tasks.startDate, to)),
          ),
        ),
      )
      .orderBy(asc(tasks.dueDate))
      .limit(200)

    const inRoom = await this.db
      .select({
        id: meetings.id,
        title: meetings.title,
        startsAt: meetings.startsAt,
        endsAt: meetings.endsAt,
        joinUrl: meetings.joinUrl,
      })
      .from(meetingAttendees)
      .innerJoin(meetings, eq(meetings.id, meetingAttendees.meetingId))
      .where(
        and(
          eq(meetingAttendees.userId, userId),
          eq(meetings.workspaceId, workspaceId),
          gte(meetings.startsAt, from),
          lte(meetings.startsAt, to),
        ),
      )
      .orderBy(asc(meetings.startsAt))
      .limit(200)

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      tasks: dated,
      meetings: inRoom,
    }
  }

  // ── Priorities ────────────────────────────────────────────────────────────

  /**
   * §G06 [05:54] — somebody's priorities.
   *
   * Readable by any colleague, because the panel is about a person and this is
   * the most interesting thing on it: "what are you actually doing today" is
   * the question a teammate opens a profile to answer. Writable only by the
   * person themselves — a priority is a decision, and a decision somebody else
   * can edit is not one.
   */
  async listPriorities(workspaceId: string, requesterId: string, userId: string) {
    await this.assertBothMembers(workspaceId, requesterId, userId)
    return this.db
      .select({
        id: userPriorities.id,
        taskId: userPriorities.taskId,
        // A pointed-at task shows the task's live title; a typed line shows
        // what was typed. Resolved here so the client never has to decide
        // which of two fields to render.
        title: sql<string>`coalesce(${tasks.title}, ${userPriorities.title})`,
        taskStatus: tasks.status,
        position: userPriorities.position,
        doneAt: userPriorities.doneAt,
        createdAt: userPriorities.createdAt,
      })
      .from(userPriorities)
      .leftJoin(tasks, eq(tasks.id, userPriorities.taskId))
      .where(and(eq(userPriorities.userId, userId), eq(userPriorities.workspaceId, workspaceId)))
      .orderBy(asc(userPriorities.position), asc(userPriorities.createdAt))
  }

  async addPriority(
    workspaceId: string,
    userId: string,
    input: { taskId?: string | null; title?: string | null },
  ) {
    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!membership) throw new ForbiddenException('Workspace membership required')

    const title = input.title?.trim() || null
    const taskId = input.taskId || null
    if (!taskId && !title) throw new BadRequestException('A priority needs a task or a title')
    if (title && title.length > 200) throw new BadRequestException('Keep a priority under 200 characters')

    if (taskId) {
      // The task has to be in this workspace. Without the check a priority
      // could point at a task from somewhere else and render its title on a
      // panel the reader has no access to.
      const [found] = await this.db
        .select({ id: tasks.id })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(tasks.id, taskId), eq(spaces.workspaceId, workspaceId)))
        .limit(1)
      if (!found) throw new NotFoundException('That task is not in this workspace')
    }

    // Appended, not prepended: a list you keep re-ordering from the top is a
    // list where the thing you added first sinks, which is backwards for
    // "these are the important ones, in order".
    const [last] = await this.db
      .select({ position: userPriorities.position })
      .from(userPriorities)
      .where(and(eq(userPriorities.userId, userId), eq(userPriorities.workspaceId, workspaceId)))
      .orderBy(desc(userPriorities.position))
      .limit(1)

    try {
      const [row] = await this.db
        .insert(userPriorities)
        .values({
          userId,
          workspaceId,
          taskId,
          title: taskId ? null : title,
          position: (last?.position ?? -1) + 1,
        })
        .returning()
      return row
    } catch (err) {
      // Adding a task that is already on the list is somebody making sure.
      if ((err as { code?: string })?.code === '23505') {
        const [existing] = await this.db
          .select()
          .from(userPriorities)
          .where(
            and(
              eq(userPriorities.userId, userId),
              eq(userPriorities.workspaceId, workspaceId),
              eq(userPriorities.taskId, taskId!),
            ),
          )
          .limit(1)
        if (existing) return existing
      }
      throw err
    }
  }

  /** Tick one off, or un-tick it. Only the owner. */
  async setPriorityDone(priorityId: string, userId: string, done: boolean) {
    const [row] = await this.db
      .update(userPriorities)
      .set({ doneAt: done ? new Date() : null })
      .where(and(eq(userPriorities.id, priorityId), eq(userPriorities.userId, userId)))
      .returning()
    if (!row) throw new NotFoundException('Priority not found')
    return row
  }

  async removePriority(priorityId: string, userId: string) {
    const [row] = await this.db
      .delete(userPriorities)
      .where(and(eq(userPriorities.id, priorityId), eq(userPriorities.userId, userId)))
      .returning({ id: userPriorities.id })
    if (!row) throw new NotFoundException('Priority not found')
    return { ok: true }
  }

  /**
   * Re-order the whole list in one call.
   *
   * Whole-list rather than per-row moves: a drag produces one new order, and
   * sending it as a sequence of individual position writes is how two drags in
   * quick succession end up interleaved into an order nobody chose.
   */
  async reorderPriorities(workspaceId: string, userId: string, ids: string[]) {
    if (!Array.isArray(ids)) throw new BadRequestException('ids must be an array')
    const owned = await this.db
      .select({ id: userPriorities.id })
      .from(userPriorities)
      .where(and(eq(userPriorities.userId, userId), eq(userPriorities.workspaceId, workspaceId)))
    const ownedIds = new Set(owned.map((r) => r.id))
    // Silently ignoring a foreign id would let a reorder half-apply; refusing
    // says which list the caller is actually looking at.
    const foreign = ids.filter((id) => !ownedIds.has(id))
    if (foreign.length > 0) throw new BadRequestException('Those priorities are not yours to reorder')

    for (const [index, id] of ids.entries()) {
      await this.db
        .update(userPriorities)
        .set({ position: index })
        .where(and(eq(userPriorities.id, id), eq(userPriorities.userId, userId)))
    }
    return this.listPriorities(workspaceId, userId, userId)
  }
}
