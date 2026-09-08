import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, ilike } from 'drizzle-orm'
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
  taskDependencies,
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
import { AiService } from '../ai/ai.service'
import type { StandupData } from './standup'
import { startOfDayIn } from '../../common/time/zone'
import { CalendarAccountsService } from '../calendar-sync/calendar-accounts.service'
import { mergeBusy, toBusyWindows } from '../calendar-sync/free-busy'

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
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private ai: AiService,
    // §V2-14c — the calendars a person has marked as deciding when they are busy.
    private calendarAccounts: CalendarAccountsService,
  ) {}

  /**
   * §G05 [05:40] — the standup, gathered and then written.
   *
   * Two steps kept apart on purpose. `getStandup` decides what is TRUE about
   * this person's work; the model only decides how to say it, and is handed
   * nothing but that. A summary generated from a free-text prompt would be
   * free to invent a task, and the person reading it has no way to tell.
   *
   * The data comes back alongside the prose for the same reason: the panel can
   * show the counts it is claiming, so a reader who doubts a sentence can look
   * at what it was written from.
   */
  async generateStandup(
    workspaceId: string,
    requesterId: string,
    userId: string,
    opts: { days?: number } = {},
  ): Promise<{ text: string; data: StandupData; generated: boolean }> {
    const data = await this.getStandup(workspaceId, requesterId, userId, opts)
    const text = await this.ai.generateStandup(data, { userId: requesterId, workspaceId })
    return { text, data, generated: this.ai.isAvailable() }
  }

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

    /** One panel section's worth. Each bucket gets its own, never a shared page. */
    const BUCKET_LIMIT = 25

    /**
     * Open work that is theirs, in this workspace. Shared by every bucket below.
     *
     * `isArchived` matters as much as `status`: deleting a task archives it
     * rather than removing the row (tasks.service.ts deleteTask), and this
     * clause was missing — so a task you deleted kept appearing on your profile
     * as due today, with no way to get rid of it. The createdUnassigned query
     * below always excluded archived rows; these did not.
     */
    const mine = and(
      eq(taskAssignees.userId, userId),
      eq(spaces.workspaceId, workspaceId),
      ne(tasks.status, 'done'),
      eq(tasks.isArchived, false),
    )

    const assignedColumns = {
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      listId: tasks.listId,
      listName: lists.name,
    }

    // What they are working on: open tasks assigned to them, soonest due first.
    const assigned = await this.db
      .select(assignedColumns)
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(mine)
      // Nulls last: a task with a date is more urgent than one without, and
      // Postgres sorts NULL first ascending by default, which would put every
      // undated task above everything that is actually due.
      .orderBy(sql`${tasks.dueDate} asc nulls last`)
      .limit(BUCKET_LIMIT)

    /*
     * §G05 [06:08–06:14] — the buckets she names, in her order:
     *
     * > "TODAY ke kya task hain, OVERDUE kaun se ho gaye the, NEXT kaun se
     * >  upcoming task mere paas aa sakte hain, kaun si aisi cheezein jo maine
     * >  CREATE ki hain par abhi tak maine kisi ko assign nahi kiya."
     *
     * The panel showed one flat "Working on" list, which answers none of the
     * four questions: what is due now, what is late, what is coming, and what
     * have I made that is still sitting on nobody.
     *
     * "Today" is today WHERE THEY ARE. A profile already shows their local
     * time for the same reason — a deadline is a fact about their day, not
     * about the server's, and a teammate eight hours away reading this panel
     * should see the same buckets they would.
     */
    const zone = person.timezone || 'UTC'
    const dayStart = startOfDayIn(zone)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    /*
     * Each bucket is its OWN query, with its own limit.
     *
     * This used to fetch the 25 earliest-due assigned tasks and split that page
     * four ways in JavaScript. Sorting by due date ascending means the page
     * fills with the oldest overdue work first, so on any account with 25+
     * dated tasks — which is every real account after a few weeks — NEXT and
     * UNSCHEDULED were permanently empty. Not "sometimes short": structurally
     * unreachable, because the rows that would land in them are past the LIMIT
     * before the filter ever runs. Measured on a working account: 18 overdue +
     * 7 today = 25, with `next: 0` while upcoming work existed.
     *
     * A limit that hides a whole category reads exactly like "you have nothing
     * coming up", which is the one thing this panel must never say wrongly.
     */
    const bucketRows = (where: ReturnType<typeof and>, order: 'asc' | 'desc') =>
      this.db
        .select(assignedColumns)
        .from(taskAssignees)
        .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(mine, where))
        .orderBy(order === 'asc' ? asc(tasks.dueDate) : desc(tasks.dueDate))
        .limit(BUCKET_LIMIT)

    // Half-open on both sides, matching the filters this replaced: a task due
    // at exactly midnight tomorrow is coming up, not due today.
    const [today, overdue, next, unscheduled] = await Promise.all([
      bucketRows(and(gte(tasks.dueDate, dayStart), lt(tasks.dueDate, dayEnd)), 'asc'),
      // Newest miss first: the deadline you blew yesterday is the one you act
      // on, not the one from four months ago.
      bucketRows(lt(tasks.dueDate, dayStart), 'desc'),
      // Soonest first: "what is coming" is answered from the near end.
      bucketRows(gte(tasks.dueDate, dayEnd), 'asc'),
      // Undated work is neither late nor coming; it would otherwise vanish
      // from a panel built entirely out of date buckets.
      bucketRows(isNull(tasks.dueDate), 'asc'),
    ])
    /*
     * G05-4 [06:08] — the two she names that had no equivalent anywhere.
     *
     * DONE deliberately breaks the `mine` filter, which excludes finished work
     * — that is the point of the bucket: "what did I actually get done". Capped
     * and ordered by completion, so it is a recent record rather than an
     * archive nobody scrolls.
     *
     * DELEGATED is the mirror of createdUnassigned: things you made and handed
     * to somebody ELSE. Together they answer the accountability question in
     * both directions — what I passed on, and what I dropped.
     */
    const doneColumns = { ...assignedColumns, completedAt: tasks.completedAt }
    const [done, delegated] = await Promise.all([
      this.db
        .select(doneColumns)
        .from(taskAssignees)
        .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(
          and(
            eq(taskAssignees.userId, userId),
            eq(spaces.workspaceId, workspaceId),
            eq(tasks.statusCategory, 'closed'),
            eq(tasks.isArchived, false),
          ),
        )
        // Nulls last: a closed task with no completedAt is older bookkeeping,
        // not the most recent thing this person finished.
        .orderBy(sql`${tasks.completedAt} desc nulls last`)
        .limit(BUCKET_LIMIT),
      this.db
        .select(assignedColumns)
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(
          and(
            eq(tasks.createdById, userId),
            eq(spaces.workspaceId, workspaceId),
            ne(tasks.status, 'done'),
            eq(tasks.isArchived, false),
            // Somebody is on it, and it is not you — "I handed this over".
            // A task you created and kept is simply your own work.
            sql`exists (select 1 from ${taskAssignees} where ${taskAssignees.taskId} = ${tasks.id})`,
            sql`not exists (select 1 from ${taskAssignees} where ${taskAssignees.taskId} = ${tasks.id} and ${taskAssignees.userId} = ${userId})`,
          ),
        )
        .orderBy(desc(tasks.createdAt))
        .limit(BUCKET_LIMIT),
    ])

    const buckets = { today, overdue, next, unscheduled, done, delegated }

    /*
     * "Cheezein jo maine CREATE ki hain par abhi tak kisi ko assign nahi kiya"
     * — a separate question from anything above: these are tasks they made
     * that are sitting on nobody, which is exactly the pile that goes quiet.
     */
    const createdUnassigned = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        listId: tasks.listId,
        listName: lists.name,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(tasks.createdById, userId),
          eq(spaces.workspaceId, workspaceId),
          ne(tasks.status, 'done'),
          eq(tasks.isArchived, false),
          // Nobody on it at all — one assignee is enough to make it somebody's.
          sql`not exists (select 1 from ${taskAssignees} where ${taskAssignees.taskId} = ${tasks.id})`,
        ),
      )
      /*
       * Newest first, not by due date.
       *
       * Sorting these by `dueDate asc nulls last` put every UNDATED unassigned
       * task behind every dated one — and "I made this and have not handed it
       * out yet" is overwhelmingly a task with no date on it, so the rows this
       * bucket exists to surface were the exact rows the limit cut off.
       */
      .orderBy(desc(tasks.createdAt))
      .limit(BUCKET_LIMIT)

    return {
      person: {
        ...person,
        // The same expiry rule every other reader applies.
        customStatus: PresenceService.liveStatus(person),
        status: PresenceService.resolveStatus(person.presenceStatus, person.lastSeenAt),
      },
      teams,
      reporting: { manager, reports },
      // Kept: other readers already depend on the flat list, and the buckets
      // below are a view OF it rather than a replacement for it.
      assignedTasks: assigned,
      taskBuckets: { ...buckets, createdUnassigned },
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
   * §G05 [05:40] — "✦ Get StandUp".
   *
   * What this person has been doing, on demand, from their profile. The daily
   * briefing answers the same shape of question about YOURSELF and is pushed
   * on a schedule; this is about somebody else and is pulled when you ask,
   * which is why it could not simply reuse it.
   *
   * Four buckets, scoped to this workspace. "Active" is read from the activity
   * log by ACTOR rather than from `tasks.updatedAt`: a task is updated when
   * anybody touches it, so an updatedAt window reports work this person did not
   * do — which, on a summary somebody's manager is reading, is the one error
   * worth going out of the way to avoid.
   *
   * Bounded on both sides. Each bucket is capped so a person with four hundred
   * tasks produces a paragraph rather than a page, and the window is clamped so
   * a caller cannot ask for a year of history in a request that is meant to
   * answer while a panel is open.
   */
  async getStandup(
    workspaceId: string,
    requesterId: string,
    userId: string,
    opts: { days?: number } = {},
  ): Promise<StandupData> {
    await this.assertBothMembers(workspaceId, requesterId, userId)

    const days = Math.min(Math.max(Math.trunc(opts.days ?? 7) || 7, 1), 30)
    const now = new Date()
    const since = new Date(now.getTime() - days * 86_400_000)
    const CAP = 20

    // Every bucket is a task in THIS workspace assigned to this person. The
    // join chain is the same one the activity feed uses; tasks reach a
    // workspace only through their list's project's space.
    const inWorkspace = and(eq(taskAssignees.userId, userId), eq(spaces.workspaceId, workspaceId))

    const columns = {
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
    }
    const from = () =>
      this.db
        .select(columns)
        .from(taskAssignees)
        .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))

    const done = await from()
      .where(and(inWorkspace, eq(tasks.isArchived, false), eq(tasks.statusCategory, 'closed'), gte(tasks.completedAt, since)))
      .orderBy(desc(tasks.completedAt))
      .limit(CAP)

    // Distinct, because a person who touched one task nine times has done one
    // thing. `select distinct` rather than a Set afterwards so the LIMIT counts
    // tasks rather than activity rows — the same post-limit trap that made
    // search return nothing earlier in this engagement.
    const active = await this.db
      .selectDistinct(columns)
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .innerJoin(taskAssignees, and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.userId, userId)))
      .where(
        and(
          eq(taskActivity.actorId, userId),
          eq(spaces.workspaceId, workspaceId),
          gte(taskActivity.createdAt, since),
          eq(tasks.isArchived, false),
          ne(tasks.statusCategory, 'closed'),
        ),
      )
      .limit(CAP)

    const overdue = await from()
      .where(
        and(
          inWorkspace,
          eq(tasks.isArchived, false),
          ne(tasks.statusCategory, 'closed'),
          lte(tasks.dueDate, now),
        ),
      )
      .orderBy(asc(tasks.dueDate))
      .limit(CAP)

    const [person] = await this.db
      .select({ displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    return {
      displayName: person?.displayName || person?.email || '',
      days,
      done,
      active,
      overdue,
      blocked: await this.blockedTasks(workspaceId, userId, CAP),
    }
  }

  /**
   * Their open tasks that are waiting on another task which is also still open.
   *
   * The mirror of the briefing's `blockingTasks`, which asks the other
   * question — what of yours is holding somebody else up. A dependency row is
   * stored from either end (`blocks` or `blocked_by`), so which column names
   * the blocker depends on the row's type; getting that backwards produces a
   * list that looks entirely plausible and is exactly inverted.
   */
  private async blockedTasks(workspaceId: string, userId: string, cap: number): Promise<StandupData['blocked']> {
    const blocker = alias(tasks, 'standup_blocker')
    const blocked = alias(tasks, 'standup_blocked')
    const rows = await this.db
      .selectDistinct({
        id: blocked.id,
        title: blocked.title,
        dueDate: blocked.dueDate,
        completedAt: blocked.completedAt,
      })
      .from(taskDependencies)
      .innerJoin(
        blocked,
        sql`${blocked.id} = case when ${taskDependencies.type} = 'blocks' then ${taskDependencies.relatedTaskId} else ${taskDependencies.taskId} end`,
      )
      .innerJoin(
        blocker,
        sql`${blocker.id} = case when ${taskDependencies.type} = 'blocks' then ${taskDependencies.taskId} else ${taskDependencies.relatedTaskId} end`,
      )
      .innerJoin(taskAssignees, and(eq(taskAssignees.taskId, blocked.id), eq(taskAssignees.userId, userId)))
      .innerJoin(lists, eq(lists.id, blocked.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          inArray(taskDependencies.type, ['blocks', 'blocked_by']),
          ne(blocked.statusCategory, 'closed'),
          eq(blocked.isArchived, false),
          // Still open, or it is not blocking anything any more.
          ne(blocker.statusCategory, 'closed'),
          eq(blocker.isArchived, false),
        ),
      )
      .limit(cap)
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

    /*
     * §V2-14c, frame `13:50` — "These calendars decide when you're busy."
     *
     * `meetings` stays exactly as it was, because the planner draws it with
     * titles for a colleague you are allowed to see. `busy` is the union of
     * that and any EXTERNAL calendar this person has marked as counting — and
     * it carries no titles at all, because a personal calendar says things
     * like "MRI results". You may know somebody is busy at three; you may not
     * know why.
     *
     * External windows are fetched best-effort: a Google outage, or a token
     * that needs re-granting, must not take out a colleague's whole calendar
     * view. When they cannot be fetched the answer is Rundesk's own time,
     * which is what it was before this existed.
     */
    const external = await this.calendarAccounts
      .externalBusyWindows(userId, workspaceId, from, to)
      .catch(() => [] as ReturnType<typeof toBusyWindows>)

    const busy = mergeBusy([
      ...toBusyWindows(inRoom.map((m) => ({ start: m.startsAt, end: m.endsAt })), 'rundesk'),
      ...external,
    ])

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      tasks: dated,
      meetings: inRoom,
      busy,
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
