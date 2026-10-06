import { Injectable, Inject, BadRequestException, NotFoundException, ForbiddenException, HttpException } from '@nestjs/common'
import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { taskTimeBlocks, tasks, users, lists, projects, spaces, workspaces } from '@rundesk/db'
import type { Db, PlannerSettings } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { readableTaskIds } from '../../common/permissions/read-access'
import { assertCanCreateTaskIn, ListInTrashException } from '../../common/permissions/task-create'
import { isUuid } from '../../common/validation/uuid'
import { PeopleService } from '../people/people.service'
import { CalendarAccountsService } from '../calendar-sync/calendar-accounts.service'

/**
 * §V2-02 — the Planner.
 *
 * `[12:40]` "Planner ka matlab — woh basically Google Calendar [jaisa] hai."
 * Frame `13:08` is a week grid; `[14:52]` is dragging a task onto it.
 *
 * Blocks are PERSONAL. `[14:56]` "to yeh MERI planner pe bhi show honge" —
 * this is one person's plan for their own week, not a shared schedule, which
 * is why every read here is scoped by `userId` and never widened by a role.
 * A manager who could see your blocks would be seeing your day, not your work.
 */

/** A week is the widest thing the grid asks for; a month view would ask twice. */
const MAX_RANGE_DAYS = 62

/** Frame `14:45` — dragging task `dbgdh` on makes a block "Work on dbgdh". */
export const DEFAULT_BLOCK_PREFIX = 'Work on'

/**
 * §V2-14d, frame `13:28` — the picker's second group, headed with the
 * WORKSPACE's name and holding exactly two calendars: **Time off** and
 * **Holidays**.
 *
 * They are listed here, once, and the web picker imports its labels from its
 * own catalogue keyed on these same ids. Two hand-written copies of "the
 * workspace has these two calendars" is how the third picker in this ledger
 * ended up offering ten of nineteen field types.
 */
export const WORKSPACE_CALENDAR_IDS = ['workspace:timeOff', 'workspace:holidays'] as const
export type WorkspaceCalendarId = (typeof WORKSPACE_CALENDAR_IDS)[number]

/**
 * Frames `14:13`–`14:16` — the planner rail's five sections, as the Sidebar
 * page lists them. `railSections` is the shown ones in the order the rail
 * draws them, so it may name each of these once and nothing else
 * (`found-29-sep/rail-sections-kept-as-sent`). The web's copy is `RAIL_SECTIONS`
 * in `planner-settings-dialog.tsx`.
 */
export const RAIL_SECTIONS = ['priorities', 'meetWith', 'assignedToMe', 'todayOverdue', 'backlog'] as const

/**
 * §V2-15b — how many people the side-by-side grid will draw at once.
 *
 * Not a performance limit: each column is a `getCalendar` call, and twelve
 * columns on a laptop is already a grid nobody can read. The refusal names the
 * number so a client can say why rather than silently dropping the tail, which
 * is the shape of the confident-zero defect.
 */
export const MAX_TEAM_SCHEDULE_PEOPLE = 8

/**
 * The people a team schedule will actually draw, in the order asked.
 *
 * De-duplicated BEFORE the cap, and the caller's order is kept. Without the
 * de-dupe, "Sara, Sara" draws two identical columns — the one failure mode a
 * side-by-side grid cannot survive, because two columns of the same person look
 * exactly like two people who happen to be busy at the same times.
 *
 * EXTRACTED SO IT CAN BE TESTED AT ALL. This was three statements inside
 * `teamSchedules`, and the only suite covering that feature —
 * `team-schedules.mjs` — intercepts `**\/api\/**` at the browser context, so no
 * server code runs in it whatever. `ts-9-dedupe-dropped` removes the de-dupe
 * and ran GREEN for that reason: it changes a line nothing in the repository
 * executes. A fact this important cannot rest on a suite that cannot reach it.
 */
export function teamScheduleColumns(userIds: string[]): string[] {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length > MAX_TEAM_SCHEDULE_PEOPLE) {
    throw new BadRequestException(
      `A team schedule can show at most ${MAX_TEAM_SCHEDULE_PEOPLE} people at once`,
    )
  }
  return unique
}

/** The values `users.week_start` already accepts, unchanged. */
const WEEK_STARTS = ['sunday', 'monday', 'saturday']

/**
 * Checked against the runtime's own timezone database rather than a list kept
 * here. A hard-coded list goes stale the next time a country moves its clocks,
 * and the failure is a person unable to pick where they live.
 */
function isKnownTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

function parseInstant(value: unknown, field: string): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new BadRequestException(`"${field}" must be a date`)
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`"${field}" is not a valid date`)
  return d
}

@Injectable()
export class PlannerService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    /*
     * §V2-15b — the side-by-side grid asks `PeopleService` for each column
     * rather than reading meetings and free/busy itself.
     *
     * That is the point. `getCalendar` is where the privacy rule lives: a
     * window carries a start, an end and a source and HAS NO TITLE FIELD, and
     * `assertBothMembers` is what stops a non-member reading anybody. A team
     * grid with its own query would be a second answer to "when is this person
     * busy" — and the second one would be the one written by somebody who had
     * not read the comment on the first.
     */
    private people: PeopleService,
    /** §V2-14d — the picker's account groups are this service's rows, projected
     *  through `PUBLIC_CALENDAR_ACCOUNT_COLUMNS` so no token can ride along. */
    private accounts: CalendarAccountsService,
  ) {}

  /**
   * §V2-14d, frame `13:28` — everything the calendar picker draws, in the
   * order it draws it.
   *
   * ASSEMBLED HERE, NOT IN THE BROWSER. The frame's popover is two kinds of
   * thing in one list — external accounts and calendars the workspace itself
   * owns — and a client that built that list would have to know which
   * workspace calendars exist. That knowledge would then live in two places,
   * which is the duplicated-list defect this ledger has now found seven times.
   * The labels stay in the web catalogue (they are translated); the SET, the
   * grouping, the order and the hidden flag come from here.
   *
   * `checked` is the live answer, not a default: an account is checked when
   * `counts_as_busy` is on — the column that already means "this calendar is
   * read" — and a workspace calendar is checked when it is not in the person's
   * hide-list. So the count chip beside the picker is a count of calendars
   * that genuinely contribute, which is the difference between this and a
   * badge that always says the number of rows.
   */
  async listCalendars(workspaceId: string, userId: string) {
    const [accounts, settings, [workspace]] = await Promise.all([
      this.accounts.list(userId, workspaceId),
      this.getSettings(userId),
      this.db
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1),
    ])

    const hidden = new Set(settings.hiddenCalendarIds ?? [])
    const accountGroups = accounts.map((a: any) => ({
      /* The group heading in the frame is the ADDRESS, not the provider —
       * `hanixh343@gmail.com` — because somebody with two Google accounts gets
       * two groups both headed "Google" otherwise. */
      key: `account:${a.id}`,
      title: a.externalAccountEmail || a.provider,
      kind: 'account' as const,
      calendars: [
        {
          id: `account:${a.id}`,
          label: a.externalAccountEmail || a.provider,
          checked: a.countsAsBusy === true,
          isDefault: a.isDefault === true,
          accountId: a.id,
          kind: 'account' as const,
        },
      ],
    }))

    return {
      groups: [
        ...accountGroups,
        {
          key: 'workspace',
          title: workspace?.name ?? '',
          kind: 'workspace' as const,
          calendars: WORKSPACE_CALENDAR_IDS.map((id) => ({
            id,
            /* No label: the web has the translated one, keyed on this id. A
             * server-side English string here would be the thing four locales
             * then failed to translate. */
            label: null,
            checked: !hidden.has(id),
            isDefault: false,
            accountId: null,
            kind: 'workspace' as const,
          })),
        },
      ],
    }
  }

  /**
   * §V2-15b, frame `12:48` — several people's calendars, side by side.
   *
   * ONE CALL PER PERSON, GATHERED HERE rather than N calls from the browser.
   * The browser version was the obvious build and it is wrong twice: eight
   * round trips against a shared `staleTime` make the grid fill in raggedly,
   * and — worse — a column whose request failed would simply render empty,
   * which is a person with no meetings and a person the server could not reach
   * drawn identically. Here a failure is `error` ON THAT COLUMN, so the grid
   * can say which person it could not answer for.
   *
   * Every column goes through `assertBothMembers` inside `getCalendar`, so
   * passing a stranger's id refuses that column instead of widening the read.
   */
  async teamSchedules(
    workspaceId: string,
    requesterId: string,
    userIds: string[],
    opts: { from?: string; to?: string } = {},
  ) {
    const unique = teamScheduleColumns(userIds)
    if (unique.length === 0) return { people: [] }

    const columns = await Promise.all(
      unique.map(async (userId) => {
        try {
          const calendar = await this.people.getCalendar(workspaceId, requesterId, userId, opts)
          return { userId, ...calendar, error: null as string | null }
        } catch (err: any) {
          /*
           * A column that could not be read says so and the rest still draw.
           * Throwing would mean one person leaving the workspace blanked the
           * whole grid — and `busy: []` would mean the same thing as "free all
           * week", which is the confidently-wrong state `free-busy.ts` exists
           * to prevent.
           */
          return {
            userId,
            meetings: [],
            busy: [],
            error: typeof err?.message === 'string' ? err.message : 'Could not read that calendar',
          }
        }
      }),
    )
    return { people: columns }
  }

  /**
   * The blocks on one person's grid between two instants.
   *
   * Half-open on purpose — `[from, to)` — so asking for two consecutive weeks
   * returns each block exactly once. A closed range double-counts anything
   * starting precisely at midnight on the boundary, which is most all-day
   * blocks.
   */
  async listBlocks(workspaceId: string, userId: string, fromRaw: unknown, toRaw: unknown) {
    const from = parseInstant(fromRaw, 'from')
    const to = parseInstant(toRaw, 'to')
    if (to <= from) throw new BadRequestException('"to" must be after "from"')
    const days = (to.getTime() - from.getTime()) / 86_400_000
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException(`A planner range covers at most ${MAX_RANGE_DAYS} days`)
    }

    const rows = await this.db
      .select({
        id: taskTimeBlocks.id,
        taskId: taskTimeBlocks.taskId,
        title: taskTimeBlocks.title,
        startsAt: taskTimeBlocks.startsAt,
        endsAt: taskTimeBlocks.endsAt,
        isAllDay: taskTimeBlocks.isAllDay,
        taskTitle: tasks.title,
        taskStatus: tasks.status,
        taskPriority: tasks.priority,
        taskListId: tasks.listId,
        /*
         * §V2-02e — what "Show recurring" has to have in order to mean
         * anything. A block on a recurring task is one occurrence of something
         * that happens again; the grid can only draw the next ones if it is
         * told the cadence, and it was not. The setting existed, the column
         * existed, and the two had never been introduced.
         *
         * Sent as the task's stored recurrence rather than as pre-computed
         * dates: the range the grid draws changes with the view and the
         * arrows, and a server that baked in a horizon would be wrong for
         * every span but the one it guessed.
         */
        taskRecurrence: tasks.recurrence,
      })
      .from(taskTimeBlocks)
      .leftJoin(tasks, eq(tasks.id, taskTimeBlocks.taskId))
      .where(
        and(
          eq(taskTimeBlocks.workspaceId, workspaceId),
          eq(taskTimeBlocks.userId, userId),
          gte(taskTimeBlocks.startsAt, from),
          lt(taskTimeBlocks.startsAt, to),
        ),
      )
      .orderBy(asc(taskTimeBlocks.startsAt))

    /*
     * A TASK THE OWNER MAY OPEN, IN THIS WORKSPACE, or none of it: a block
     * made before `createBlock` checked could point at another workspace's
     * task or a refused space's, and rendered its title (measured on lane 1).
     * Such a block keeps its place on the grid and loses the task's fields.
     */
    const readable = await this.readableTaskIds(
      workspaceId,
      userId,
      rows.map((r) => r.taskId).filter((id): id is string => !!id),
    )
    const shown = rows.map((r) =>
      r.taskId && !readable.has(r.taskId)
        ? { ...r, taskTitle: null, taskStatus: null, taskPriority: null, taskListId: null, taskRecurrence: null }
        : r,
    )
    /*
     * `label` is resolved here rather than stored, so renaming a task renames
     * every block that points at it. A stored copy would leave last week's
     * grid describing a task by a name it no longer has.
     */
    return shown.map((r) => ({ ...r, label: r.title ?? r.taskTitle ?? null }))
  }

  /**
   * Of these task ids, the ones in this workspace that this person may open:
   * the container rule and the private-item rule, as every task read applies.
   */
  private async readableTaskIds(workspaceId: string, userId: string, taskIds: string[]): Promise<Set<string>> {
    return readableTaskIds(this.db, workspaceId, userId, taskIds)
  }

  /**
   * The person's own planner preferences.
   *
   * Returned WITH `weekStart` and `timezone`, which are columns on `users` and
   * not part of the planner blob. Frame `14:10` puts "Start week on" and
   * "Timezone" on the Appearance page, so the page needs them — but they are
   * account-wide settings that every date in the product already honours, and
   * a planner-local copy that could drift from them would be a bug with a
   * settings page for creating it. The page reads and writes the real columns
   * through here.
   */
  async getSettings(
    userId: string,
    workspaceId?: string,
  ): Promise<PlannerSettings & { weekStart: string; timezone: string; defaultListInTrash?: boolean }> {
    const [row] = await this.db
      .select({ settings: users.plannerSettings, weekStart: users.weekStart, timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const settings = {
      ...(row?.settings ?? {}),
      weekStart: row?.weekStart ?? 'sunday',
      timezone: row?.timezone ?? 'UTC',
    }
    const chosen = (settings as PlannerSettings).defaultListId
    if (!workspaceId || typeof chosen !== 'string' || !chosen) return settings
    return { ...settings, defaultListInTrash: await this.defaultListInTrash(userId, workspaceId, chosen) }
  }

  /**
   * WHETHER THE CHOSEN DEFAULT LIST IS THIS WORKSPACE'S, AND IN ITS TRASH — the
   * one case in which `/task`, a chat message and the AI's "Create task from
   * this" refuse, saying so, and send the person to the picker to choose
   * another (`TasksService.defaultListFor`,
   * `found-5-oct/default-list-files-into-an-archived-list`). The picker had no
   * option for it and showed "The first list I can add to" as chosen, while the
   * server held the deleted list. Asked as `defaultListFor` asks it — the
   * list's workspace, then the create gate, whose trash refusal this is — so a
   * list of another workspace, or one the person may no longer open, which
   * those pass over for the oldest list they may add to, is not called so.
   */
  private async defaultListInTrash(userId: string, workspaceId: string, listId: string): Promise<boolean> {
    if (!isUuid(listId)) return false
    const [home] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    if (home?.workspaceId !== workspaceId) return false
    try {
      await assertCanCreateTaskIn(this.db, listId, userId)
      return false
    } catch (err) {
      if (err instanceof ListInTrashException) return true
      if (err instanceof HttpException) return false
      throw err
    }
  }

  async updateSettings(
    userId: string,
    patch: PlannerSettings & { weekStart?: string; timezone?: string },
  ) {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new BadRequestException('Planner settings must be an object')
    }
    /*
     * `weekStart` and `timezone` are peeled off and written to their own
     * columns rather than into the blob — see `getSettings`. Everything else
     * in the product reads those columns, so the Appearance page changing
     * them has to change them for real, not just for the calendar.
     */
    const { weekStart, timezone, ...plannerOnly } = patch
    if (weekStart !== undefined && !WEEK_STARTS.includes(weekStart)) {
      throw new BadRequestException(`Week start must be one of ${WEEK_STARTS.join(', ')}`)
    }
    if (timezone !== undefined && !isKnownTimezone(timezone)) {
      throw new BadRequestException('That is not a timezone this system knows')
    }
    /*
     * §V2-02e — the switches are booleans, and until now anything at all was
     * accepted into the blob.
     *
     * This matters more than it looks. A reader written as `value !== false`
     * treats the string `"false"` as ON, and a reader written as
     * `value === true` treats it as OFF — so a bad value does not fail, it
     * makes two readers of one setting disagree. Rejecting it here is the only
     * place that cannot drift.
     */
    const BOOLEAN_KEYS = [
      'showWeekends',
      'showWeekNumbers',
      'alwaysOpenAtStartOfWeek',
      'darkenNonWorkingHours',
      'savePersonalEventsQuickly',
      'showAssigned',
      'showRecurring',
      'showOverdue',
      'upcomingShowTimeLeft',
      'upcomingQuickJoin',
      'upcomingDesktopNotify',
      'plannerOnboardingDismissed',
    ] as const
    for (const key of BOOLEAN_KEYS) {
      const value = (plannerOnly as Record<string, unknown>)[key]
      if (value !== undefined && typeof value !== 'boolean') {
        throw new BadRequestException(`"${key}" must be true or false`)
      }
    }
    /*
     * §V2-15a, frame `14:05` — Grid size.
     *
     * Validated against the same three the swatches offer. An unknown value
     * would fall through the reader's lookup to `undefined` and make the hour
     * height `NaN`, which does not throw: it draws a grid with no rows at all.
     */
    if (patch.gridSize !== undefined) {
      const allowed = ['default', 'large', 'xl']
      if (!allowed.includes(patch.gridSize as string)) {
        throw new BadRequestException(`Grid size must be one of ${allowed.join(', ')}`)
      }
    }
    /*
     * §V2-14d / §V2-15b — the two string-array settings.
     *
     * Rejected rather than coerced, for the reason the boolean block above
     * gives: a blob that accepts anything makes two readers of one setting
     * disagree instead of failing. `hiddenCalendarIds` is narrowed to the
     * workspace calendar keys the picker can actually hide, so a client cannot
     * park an account id in there and expect the grid to honour it — that half
     * is the account's own `counts_as_busy` column.
     */
    for (const key of ['hiddenCalendarIds', 'teamScheduleUserIds'] as const) {
      const value = (plannerOnly as Record<string, unknown>)[key]
      if (value === undefined) continue
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v)) {
        throw new BadRequestException(`"${key}" must be an array of ids`)
      }
      if (value.length > 50) {
        throw new BadRequestException(`"${key}" cannot hold more than 50 entries`)
      }
    }
    if (patch.hiddenCalendarIds !== undefined) {
      const unknown = patch.hiddenCalendarIds.filter(
        (id) => !(WORKSPACE_CALENDAR_IDS as readonly string[]).includes(id),
      )
      if (unknown.length) {
        throw new BadRequestException(`Not a calendar that can be hidden: ${unknown[0]}`)
      }
    }
    /*
     * The rail's order. The web passes over a name that is no section and a
     * repeat, but a stored order is what the rail is drawn in, and one reader
     * forgiving a bad value is not a rule: the sections, each at most once.
     */
    if (patch.railSections !== undefined) {
      const value: unknown = patch.railSections
      if (!Array.isArray(value) || value.some((v) => !(RAIL_SECTIONS as readonly unknown[]).includes(v))) {
        throw new BadRequestException(`The rail's sections are ${RAIL_SECTIONS.join(', ')}`)
      }
      if (new Set(value).size !== value.length) {
        throw new BadRequestException('The rail names a section twice')
      }
    }
    /* The fourth value is `list`, and the web dialog's own copy of this union
     * was missing it for as long as the controller has accepted it. */
    if (patch.colorTasksBy !== undefined) {
      const allowed = ['none', 'priority', 'status', 'list']
      if (!allowed.includes(patch.colorTasksBy as string)) {
        throw new BadRequestException(`Colour tasks by must be one of ${allowed.join(', ')}`)
      }
    }
    /*
     * The block prefix: a word or two, or null to go back to "Work on" (both
     * readers fall back on null). The box sent `undefined` when emptied, which
     * JSON drops, so the merge below kept the old prefix and it could never be
     * cleared (`product-siblings/planner-block-prefix-cannot-clear`).
     */
    if (patch.blockPrefix !== undefined && patch.blockPrefix !== null) {
      if (typeof patch.blockPrefix !== 'string' || patch.blockPrefix.trim().length > 40) {
        throw new BadRequestException('The block prefix must be text, 40 characters at most')
      }
    }
    if (patch.defaultDurationMinutes !== undefined) {
      const n = patch.defaultDurationMinutes
      if (!Number.isInteger(n) || n < 5 || n > 24 * 60) {
        throw new BadRequestException('Default event duration must be between 5 minutes and 24 hours')
      }
    }
    /*
     * A default list you cannot post to is worse than no default: every task
     * created from a message would fail somewhere the person never sees.
     */
    if (patch.defaultListId) {
      const [list] = await this.db
        .select({ id: lists.id })
        .from(lists)
        .where(eq(lists.id, patch.defaultListId))
        .limit(1)
      if (!list) throw new BadRequestException('That list does not exist')
      /*
       * NOR ONE IN THE TRASH, or held in it, which takes no task: the picker
       * offers none, and `PATCH` saved one (200) for `/task` to refuse
       * (`found-6-oct/default-list-setting-takes-a-deleted-list`). Refused in
       * the create gate's words, to somebody who may open the list; any other
       * refusal of the gate is `defaultListFor`'s to pass over, as before.
       */
      try {
        await assertCanCreateTaskIn(this.db, patch.defaultListId, userId)
      } catch (err) {
        if (err instanceof ListInTrashException || !(err instanceof HttpException)) throw err
      }
    }
    const { weekStart: currentWeek, timezone: currentZone, ...currentPlanner } = await this.getSettings(userId)
    const nextPlanner = { ...currentPlanner, ...plannerOnly }
    await this.db
      .update(users)
      .set({
        plannerSettings: nextPlanner,
        weekStart: weekStart ?? currentWeek,
        timezone: timezone ?? currentZone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
    return { ...nextPlanner, weekStart: weekStart ?? currentWeek, timezone: timezone ?? currentZone }
  }

  /**
   * Put a block on the grid. `[14:52]` — the drop target of the drag.
   *
   * A task-backed block stores no title: it renders from the task, prefixed
   * with the person's own "Work on". Storing the composed string would freeze
   * both the prefix and the task's name at the moment of the drag.
   */
  async createBlock(
    workspaceId: string,
    userId: string,
    body: { taskId?: string | null; title?: string | null; startsAt: unknown; endsAt?: unknown; isAllDay?: boolean },
  ) {
    const startsAt = parseInstant(body.startsAt, 'startsAt')
    let endsAt: Date
    if (body.endsAt) {
      endsAt = parseInstant(body.endsAt, 'endsAt')
    } else {
      // No end given: the person's own default duration, which is what
      // dropping a task on the grid does — it does not ask for a length.
      const settings = await this.getSettings(userId)
      const minutes = settings.defaultDurationMinutes ?? 60
      endsAt = new Date(startsAt.getTime() + minutes * 60_000)
    }
    if (endsAt <= startsAt) throw new BadRequestException('A block must end after it starts')

    const title = body.title?.trim() || null
    if (!body.taskId && !title) {
      throw new BadRequestException('A block needs a task or a title')
    }
    if (body.taskId) {
      // The task must exist, be in this workspace, and be one its owner may
      // open — a block renders its task's title. The comment said so and the
      // query asked only that the task exist: measured on lane 1, a member of
      // one workspace (404 on another) put a block on the other's task, and on
      // a refused space's, and read both titles back off the grid.
      if (typeof body.taskId !== 'string' || !isUuid(body.taskId)) throw new NotFoundException('Task not found')
      const readable = await this.readableTaskIds(workspaceId, userId, [body.taskId])
      if (!readable.has(body.taskId)) throw new NotFoundException('Task not found')
    }

    const [row] = await this.db
      .insert(taskTimeBlocks)
      .values({
        workspaceId,
        userId,
        taskId: body.taskId ?? null,
        title: body.taskId ? null : title,
        startsAt,
        endsAt,
        isAllDay: body.isAllDay === true,
      })
      .returning()
    return row
  }

  /** Moving or resizing a block on the grid. */
  async updateBlock(
    blockId: string,
    userId: string,
    patch: { startsAt?: unknown; endsAt?: unknown; title?: string | null; isAllDay?: boolean },
  ) {
    const existing = await this.ownedBlock(blockId, userId)
    const startsAt = patch.startsAt !== undefined ? parseInstant(patch.startsAt, 'startsAt') : existing.startsAt
    const endsAt = patch.endsAt !== undefined ? parseInstant(patch.endsAt, 'endsAt') : existing.endsAt
    if (endsAt <= startsAt) throw new BadRequestException('A block must end after it starts')

    const set: Record<string, unknown> = { startsAt, endsAt, updatedAt: new Date() }
    if (patch.isAllDay !== undefined) set.isAllDay = patch.isAllDay === true
    if (patch.title !== undefined) {
      const title = patch.title?.trim() || null
      if (!existing.taskId && !title) throw new BadRequestException('A block needs a task or a title')
      // A task-backed block keeps rendering from its task; a title here would
      // be written and never read.
      if (!existing.taskId) set.title = title
    }
    const [row] = await this.db
      .update(taskTimeBlocks)
      .set(set)
      .where(eq(taskTimeBlocks.id, blockId))
      .returning()
    return row
  }

  async deleteBlock(blockId: string, userId: string) {
    await this.ownedBlock(blockId, userId)
    await this.db.delete(taskTimeBlocks).where(eq(taskTimeBlocks.id, blockId))
    return { ok: true }
  }

  /**
   * A block you do not own is a 404, not a 403 — the same reasoning as a
   * private view. Somebody else's plan for their Thursday is not something you
   * should be able to confirm the existence of.
   */
  private async ownedBlock(blockId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(taskTimeBlocks)
      .where(eq(taskTimeBlocks.id, blockId))
      .limit(1)
    if (!row) throw new NotFoundException('Block not found')
    if (row.userId !== userId) throw new NotFoundException('Block not found')
    return row
  }
}
