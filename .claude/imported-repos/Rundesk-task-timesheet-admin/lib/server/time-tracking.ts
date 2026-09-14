import { NextResponse } from "next/server";

import {
  ChannelType,
  TimeEntryType,
  TimesheetStatus,
  WorkspaceRole,
  type Prisma,
} from "@/generated/prisma/client";
import {
  MAX_ENTRY_SECONDS,
  WEEK_CAPACITY_SECONDS,
  aggregateByUser,
  aggregateEntries,
  addDaysToKey,
  findLockingSubmission,
  isFutureWeek,
  isLockedStatus,
  isValidTimeZone,
  isoWeekday,
  lockCandidateRange,
  secondsBetween,
  statusCountsFrom,
  toDayKey,
  weekContainsInstant,
  weekUtcWindow,
  type DayKey,
} from "@/lib/rundesk/time";

import {
  AccessError,
  isWorkspaceAdminRole,
  requireWorkspaceAdmin,
  requireWorkspaceMember,
} from "./access";
import { db } from "./db";
import { apiError } from "./http";

/*
 * Server-side time tracking.
 *
 * Rules enforced here (never only in the UI):
 * - You may track time on a task only if you are assigned to it, created it,
 *   or are a workspace admin/owner.
 * - You may read or change only your own entries, unless you are an admin.
 * - At most one running timer per user; starting another requires an explicit
 *   replace, which stops the previous one in the same transaction.
 * - Ranges must end after they start; durations are 1s..24h.
 * - A week that has been submitted for approval, or approved, is locked for
 *   its owner: no entry inside it may be created, edited or deleted and no
 *   timer may be started in it. Stopping a timer is always allowed. The lock
 *   follows the entry's owner, so admins are bound by it too; they reject
 *   the week first, which unlocks it.
 */

export const timeEntryInclude = {
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      channel: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TimeEntryInclude;

export type TimeEntryRecord = Prisma.TimeEntryGetPayload<{
  include: typeof timeEntryInclude;
}>;

const timesheetTaskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  channel: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

type TimesheetTaskRow = Prisma.TaskGetPayload<{ select: typeof timesheetTaskSelect }>;

export const timesheetSubmissionInclude = {
  user: { select: { id: true, name: true, avatar: true } },
  reviewedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, avatar: true } },
  assignedBy: { select: { id: true, name: true } },
} satisfies Prisma.TimesheetSubmissionInclude;

export type TimesheetSubmissionRecord = Prisma.TimesheetSubmissionGetPayload<{
  include: typeof timesheetSubmissionInclude;
}>;

/** Prisma client or the client of an interactive transaction. */
type DbClient = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TimeEntryValidationError extends Error {
  status = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = "TimeEntryValidationError";
  }
}

/** Another timer is running; the client may retry with `replaceRunning`. */
export class TimerConflictError extends Error {
  status = 409 as const;
  code = "TIMER_RUNNING" as const;

  constructor(public running: TimeEntryRecord) {
    super(`A timer is already running for “${running.task.title}”`);
    this.name = "TimerConflictError";
  }
}

export interface LockingSubmissionSummary {
  weekStart: DayKey;
  status: TimesheetStatus;
}

/** The change touches a week whose timesheet is pending approval or approved. */
export class TimesheetLockedError extends Error {
  status = 409 as const;
  code = "TIMESHEET_LOCKED" as const;

  constructor(public submission: LockingSubmissionSummary) {
    super(
      submission.status === TimesheetStatus.APPROVED
        ? "This week's timesheet has been approved and can no longer be changed"
        : "This week's timesheet is pending approval. Withdraw it to make changes",
    );
    this.name = "TimesheetLockedError";
  }
}

/** A submission state transition that is not allowed right now. */
export class TimesheetConflictError extends Error {
  status = 409 as const;
  code = "TIMESHEET_CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "TimesheetConflictError";
  }
}

/**
 * apiError plus the statuses specific to time tracking. Every 409 carries a
 * `code` so clients can tell a running timer from a locked week.
 */
export function timeApiError(error: unknown) {
  if (error instanceof TimerConflictError) {
    return NextResponse.json(
      { error: error.message, code: error.code, running: error.running },
      { status: error.status },
    );
  }

  if (error instanceof TimesheetLockedError) {
    return NextResponse.json(
      { error: error.message, code: error.code, submission: error.submission },
      { status: error.status },
    );
  }

  if (error instanceof TimesheetConflictError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  if (error instanceof TimeEntryValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return apiError(error);
}

export function isRunningTimer(entry: { entryType: TimeEntryType; endedAt: Date | null }) {
  return entry.entryType === TimeEntryType.TIMER && entry.endedAt === null;
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** The workspace a request acts in: an explicit id or the user's first one. */
export async function resolveWorkspaceId(userId: string, requested?: string | null) {
  if (requested) {
    await requireWorkspaceMember(requested, userId);
    return requested;
  }

  const membership = await db.workspaceMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true },
  });

  if (!membership) {
    throw new AccessError("Workspace membership not found", 403);
  }

  return membership.workspaceId;
}

/** Task the given user may log time against, or an AccessError. */
export async function requireTaskTimeAccess(taskId: string, userId: string) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      createdById: true,
      assignees: { where: { userId }, select: { userId: true } },
    },
  });

  if (!task) {
    throw new AccessError("Task not found", 404);
  }

  const membership = await requireWorkspaceMember(task.workspaceId, userId);

  const allowed =
    task.assignees.length > 0 ||
    task.createdById === userId ||
    isWorkspaceAdminRole(membership.role);

  if (!allowed) {
    throw new AccessError("You can only track time on tasks assigned to you", 403);
  }

  return { task, membership };
}

/** Entry the actor may read or change: their own, or any as a workspace admin. */
export async function requireEntryAccess(entryId: string, actorId: string) {
  const entry = await db.timeEntry.findUnique({
    where: { id: entryId },
    include: timeEntryInclude,
  });

  if (!entry) {
    throw new AccessError("Time entry not found", 404);
  }

  const membership = await requireWorkspaceMember(entry.workspaceId, actorId);

  if (entry.userId !== actorId && !isWorkspaceAdminRole(membership.role)) {
    // Hide other people's entries rather than confirming they exist.
    throw new AccessError("Time entry not found", 404);
  }

  return { entry, membership };
}

// ---------------------------------------------------------------------------
// Submission locks
// ---------------------------------------------------------------------------

const LOCKED_STATUSES: TimesheetStatus[] = [TimesheetStatus.SUBMITTED, TimesheetStatus.APPROVED];

const lockCandidateSelect = {
  id: true,
  weekStart: true,
  timeZone: true,
  status: true,
} satisfies Prisma.TimesheetSubmissionSelect;

/**
 * Serialises every change to one user's time in one workspace by holding
 * their membership row for the rest of the transaction. MySQL has no partial
 * unique indexes, so this is what stops "check the week is unlocked, then
 * write" and "total the week, then submit" from interleaving.
 */
async function lockMemberRow(tx: DbClient, workspaceId: string, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM WorkspaceMember WHERE workspaceId = ${workspaceId} AND userId = ${userId} FOR UPDATE`;
}

/**
 * The submitted or approved submission of `userId` whose week contains
 * `instant`, judged in the zone that week was submitted from.
 */
export async function findLockingSubmissionFor(
  client: DbClient,
  userId: string,
  workspaceId: string,
  instant: Date,
) {
  const range = lockCandidateRange(instant);

  const candidates = await client.timesheetSubmission.findMany({
    where: {
      workspaceId,
      userId,
      status: { in: LOCKED_STATUSES },
      weekStart: { gte: range.from, lte: range.to },
    },
    select: lockCandidateSelect,
  });

  return findLockingSubmission(candidates, instant);
}

/** Throws TimesheetLockedError when any instant falls in a locked week of `userId`. */
async function assertUnlocked(
  client: DbClient,
  userId: string,
  workspaceId: string,
  instants: Date[],
) {
  for (const instant of instants) {
    const locking = await findLockingSubmissionFor(client, userId, workspaceId, instant);

    if (locking) {
      throw new TimesheetLockedError({ weekStart: locking.weekStart, status: locking.status });
    }
  }
}

/**
 * Locked week that owns time logged against `taskId`, if any. Deleting the
 * task would cascade-delete those entries, so callers refuse in that case.
 */
export async function findLockedTimeOnTask(taskId: string): Promise<LockingSubmissionSummary | null> {
  const entries = await db.timeEntry.findMany({
    where: { taskId },
    select: { userId: true, workspaceId: true, startedAt: true },
  });

  const byUser = new Map<string, typeof entries>();

  for (const entry of entries) {
    const list = byUser.get(entry.userId) ?? [];
    list.push(entry);
    byUser.set(entry.userId, list);
  }

  for (const [userId, userEntries] of byUser) {
    const candidates = await db.timesheetSubmission.findMany({
      where: { workspaceId: userEntries[0].workspaceId, userId, status: { in: LOCKED_STATUSES } },
      select: lockCandidateSelect,
    });

    if (!candidates.length) {
      continue;
    }

    for (const entry of userEntries) {
      const locking = findLockingSubmission(candidates, entry.startedAt);

      if (locking) {
        return { weekStart: locking.weekStart, status: locking.status };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface EntryRangeInput {
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
}

/**
 * Normalises a manual entry's timing. With an end instant the duration is
 * derived; without one a positive duration is required.
 */
export function normaliseRange(input: EntryRangeInput) {
  if (Number.isNaN(input.startedAt.getTime())) {
    throw new TimeEntryValidationError("Start time is invalid");
  }

  if (input.endedAt) {
    if (Number.isNaN(input.endedAt.getTime())) {
      throw new TimeEntryValidationError("End time is invalid");
    }

    if (input.endedAt.getTime() <= input.startedAt.getTime()) {
      throw new TimeEntryValidationError("End time must be after start time");
    }

    const durationSeconds = secondsBetween(input.startedAt, input.endedAt);

    if (durationSeconds > MAX_ENTRY_SECONDS) {
      throw new TimeEntryValidationError("A single entry cannot be longer than 24 hours");
    }

    return { startedAt: input.startedAt, endedAt: input.endedAt, durationSeconds };
  }

  const durationSeconds = input.durationSeconds ?? 0;

  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    throw new TimeEntryValidationError("Duration must be greater than zero");
  }

  if (durationSeconds > MAX_ENTRY_SECONDS) {
    throw new TimeEntryValidationError("A single entry cannot be longer than 24 hours");
  }

  return { startedAt: input.startedAt, endedAt: null, durationSeconds };
}

function cleanNote(note: string | null | undefined) {
  const trimmed = note?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 500) : null;
}

function assertWeekArguments(weekStart: DayKey, timeZone: string) {
  if (isoWeekday(weekStart) !== 1) {
    throw new TimeEntryValidationError("week must be a Monday (YYYY-MM-DD)");
  }

  if (!isValidTimeZone(timeZone)) {
    throw new TimeEntryValidationError("tz must be a valid IANA time zone");
  }
}

// ---------------------------------------------------------------------------
// Timer lifecycle
// ---------------------------------------------------------------------------

export function getActiveTimer(userId: string) {
  return db.timeEntry.findFirst({
    where: { userId, entryType: TimeEntryType.TIMER, endedAt: null },
    include: timeEntryInclude,
    orderBy: { startedAt: "desc" },
  });
}

function finaliseTimer(
  tx: Prisma.TransactionClient,
  timer: { id: string; startedAt: Date },
  stoppedAt: Date,
  note?: string | null,
) {
  // A timer always records at least one second, even if stopped instantly.
  const endedAt =
    stoppedAt.getTime() - timer.startedAt.getTime() >= 1000
      ? stoppedAt
      : new Date(timer.startedAt.getTime() + 1000);

  return tx.timeEntry.update({
    where: { id: timer.id },
    data: {
      endedAt,
      durationSeconds: Math.max(1, secondsBetween(timer.startedAt, endedAt)),
      ...(note !== undefined ? { note: cleanNote(note) } : {}),
    },
    include: timeEntryInclude,
  });
}

/**
 * Starts a timer for `taskId`. If another timer is running, throws
 * TimerConflictError unless `replaceRunning` is set, in which case the old
 * timer is stopped and the new one started atomically. Refused with
 * TimesheetLockedError when today falls in a locked week.
 */
export async function startTimer(options: {
  userId: string;
  taskId: string;
  note?: string | null;
  replaceRunning?: boolean;
}) {
  const { task } = await requireTaskTimeAccess(options.taskId, options.userId);
  const now = new Date();

  return db.$transaction(async (tx) => {
    await lockMemberRow(tx, task.workspaceId, options.userId);
    await assertUnlocked(tx, options.userId, task.workspaceId, [now]);

    const running = await tx.timeEntry.findFirst({
      where: { userId: options.userId, entryType: TimeEntryType.TIMER, endedAt: null },
      include: timeEntryInclude,
    });

    let stopped: TimeEntryRecord | null = null;

    if (running) {
      if (!options.replaceRunning) {
        throw new TimerConflictError(running);
      }

      // Stopping is never lock-checked: a user must always be able to stop.
      stopped = await finaliseTimer(tx, running, now);
    }

    const timer = await tx.timeEntry.create({
      data: {
        workspaceId: task.workspaceId,
        taskId: task.id,
        userId: options.userId,
        entryType: TimeEntryType.TIMER,
        startedAt: now,
        endedAt: null,
        durationSeconds: 0,
        note: cleanNote(options.note),
      },
      include: timeEntryInclude,
    });

    return { timer, stopped };
  });
}

/** Stops the user's running timer and returns the finished entry, or null. */
export async function stopTimer(options: { userId: string; note?: string | null }) {
  const now = new Date();

  return db.$transaction(async (tx) => {
    const running = await tx.timeEntry.findFirst({
      where: { userId: options.userId, entryType: TimeEntryType.TIMER, endedAt: null },
      orderBy: { startedAt: "desc" },
    });

    if (!running) {
      return null;
    }

    return finaliseTimer(tx, running, now, options.note);
  });
}

// ---------------------------------------------------------------------------
// Manual entries
// ---------------------------------------------------------------------------

export async function createManualEntry(options: {
  userId: string;
  taskId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  note?: string | null;
}) {
  const { task } = await requireTaskTimeAccess(options.taskId, options.userId);
  const range = normaliseRange(options);

  return db.$transaction(async (tx) => {
    await lockMemberRow(tx, task.workspaceId, options.userId);
    await assertUnlocked(tx, options.userId, task.workspaceId, [range.startedAt]);

    return tx.timeEntry.create({
      data: {
        workspaceId: task.workspaceId,
        taskId: task.id,
        userId: options.userId,
        entryType: TimeEntryType.MANUAL,
        ...range,
        note: cleanNote(options.note),
      },
      include: timeEntryInclude,
    });
  });
}

export interface EntryPatch {
  taskId?: string;
  startedAt?: Date;
  /** null clears the end and switches to a duration-only entry */
  endedAt?: Date | null;
  durationSeconds?: number | null;
  note?: string | null;
}

export async function updateEntry(options: { actorId: string; entryId: string; patch: EntryPatch }) {
  const { entry } = await requireEntryAccess(options.entryId, options.actorId);
  const { patch } = options;

  if (isRunningTimer(entry)) {
    throw new TimeEntryValidationError("Stop the timer before editing this entry");
  }

  let taskId = entry.taskId;

  if (patch.taskId && patch.taskId !== entry.taskId) {
    // The entry's owner must be allowed to log time on the new task.
    const { task } = await requireTaskTimeAccess(patch.taskId, entry.userId);

    if (task.workspaceId !== entry.workspaceId) {
      throw new TimeEntryValidationError("Tasks must belong to the same workspace");
    }

    taskId = task.id;
  }

  const range = normaliseRange({
    startedAt: patch.startedAt ?? entry.startedAt,
    endedAt: patch.endedAt === undefined ? entry.endedAt : patch.endedAt,
    durationSeconds:
      patch.durationSeconds === undefined ? entry.durationSeconds : patch.durationSeconds,
  });

  return db.$transaction(async (tx) => {
    // Neither the week the entry leaves nor the one it moves into may be locked.
    await lockMemberRow(tx, entry.workspaceId, entry.userId);
    await assertUnlocked(tx, entry.userId, entry.workspaceId, [entry.startedAt, range.startedAt]);

    return tx.timeEntry.update({
      where: { id: entry.id },
      data: {
        taskId,
        ...range,
        ...(patch.note !== undefined ? { note: cleanNote(patch.note) } : {}),
      },
      include: timeEntryInclude,
    });
  });
}

export async function deleteEntry(options: { actorId: string; entryId: string }) {
  const { entry } = await requireEntryAccess(options.entryId, options.actorId);

  await db.$transaction(async (tx) => {
    await lockMemberRow(tx, entry.workspaceId, entry.userId);
    await assertUnlocked(tx, entry.userId, entry.workspaceId, [entry.startedAt]);
    await tx.timeEntry.delete({ where: { id: entry.id } });
  });

  return entry;
}

// ---------------------------------------------------------------------------
// Weekly timesheet
// ---------------------------------------------------------------------------

export interface TimesheetOptions {
  actorId: string;
  /** Whose timesheet; defaults to the actor. Others require admin. */
  targetUserId?: string | null;
  workspaceId?: string | null;
  /** Monday day key */
  weekStart: DayKey;
  timeZone: string;
}

interface WeekEntriesOptions {
  workspaceId: string;
  userId: string;
  weekStart: DayKey;
  timeZone: string;
}

/**
 * The week's completed entries: those whose calendar day in `timeZone` is
 * one of the seven days. Shared by the timesheet view and by submission so
 * the submitted total is exactly what the user saw.
 */
async function loadWeekEntries(client: DbClient, options: WeekEntriesOptions) {
  const { days, from, to } = weekUtcWindow(options.weekStart);
  const dayKeys = new Set(days);

  const rawEntries = await client.timeEntry.findMany({
    where: {
      workspaceId: options.workspaceId,
      userId: options.userId,
      startedAt: { gte: from, lt: to },
      NOT: { entryType: TimeEntryType.TIMER, endedAt: null },
    },
    include: timeEntryInclude,
    orderBy: { startedAt: "asc" },
  });

  const entries = rawEntries.filter((entry) =>
    dayKeys.has(toDayKey(entry.startedAt, options.timeZone)),
  );

  return { days, entries };
}

export async function getTimesheet(options: TimesheetOptions) {
  assertWeekArguments(options.weekStart, options.timeZone);

  const workspaceId = await resolveWorkspaceId(options.actorId, options.workspaceId);
  const actorMembership = await requireWorkspaceMember(workspaceId, options.actorId);
  const targetUserId = options.targetUserId || options.actorId;

  if (targetUserId !== options.actorId) {
    await requireWorkspaceAdmin(workspaceId, options.actorId);
    await requireWorkspaceMember(workspaceId, targetUserId);
  }

  const [workspace, targetUser, assignedTasks, week, activeTimer, submission, lockedNearby] =
    await Promise.all([
      db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { id: true, name: true },
      }),
      db.user.findUniqueOrThrow({
        where: { id: targetUserId },
        select: { id: true, name: true, avatar: true },
      }),
      db.task.findMany({
        where: { workspaceId, assignees: { some: { userId: targetUserId } } },
        select: timesheetTaskSelect,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      }),
      loadWeekEntries(db, {
        workspaceId,
        userId: targetUserId,
        weekStart: options.weekStart,
        timeZone: options.timeZone,
      }),
      db.timeEntry.findFirst({
        where: { workspaceId, userId: targetUserId, entryType: TimeEntryType.TIMER, endedAt: null },
        include: timeEntryInclude,
        orderBy: { startedAt: "desc" },
      }),
      db.timesheetSubmission.findUnique({
        where: {
          workspaceId_userId_weekStart: {
            workspaceId,
            userId: targetUserId,
            weekStart: options.weekStart,
          },
        },
        include: timesheetSubmissionInclude,
      }),
      // Locked weeks around this one: an entry shown here (in the viewer's
      // zone) may belong to a neighbouring week in the zone it was submitted from.
      db.timesheetSubmission.findMany({
        where: {
          workspaceId,
          userId: targetUserId,
          status: { in: LOCKED_STATUSES },
          weekStart: {
            gte: addDaysToKey(options.weekStart, -7),
            lte: addDaysToKey(options.weekStart, 7),
          },
        },
        select: lockCandidateSelect,
      }),
    ]);

  const { days } = week;

  const entries = week.entries.map((entry) => ({
    ...entry,
    locked: findLockingSubmission(lockedNearby, entry.startedAt) !== null,
  }));

  // Tasks that have time this week but are no longer assigned still get a row.
  const extraTaskIds = new Set<string>();

  for (const entry of entries) {
    extraTaskIds.add(entry.taskId);
  }

  if (activeTimer) {
    extraTaskIds.add(activeTimer.taskId);
  }

  for (const task of assignedTasks) {
    extraTaskIds.delete(task.id);
  }

  const extraTasks: TimesheetTaskRow[] = extraTaskIds.size
    ? await db.task.findMany({
        where: { id: { in: [...extraTaskIds] }, workspaceId },
        select: timesheetTaskSelect,
        orderBy: { updatedAt: "desc" },
      })
    : [];

  const tasks = [
    ...assignedTasks.map((task) => ({ ...task, assigned: true })),
    ...extraTasks.map((task) => ({ ...task, assigned: false })),
  ];

  return {
    viewer: {
      id: options.actorId,
      canManageWorkspace: isWorkspaceAdminRole(actorMembership.role),
    },
    user: targetUser,
    workspace,
    weekStart: options.weekStart,
    days,
    timeZone: options.timeZone,
    tasks,
    entries,
    totals: aggregateEntries(entries, days, options.timeZone),
    activeTimer,
    submission,
    /** True while the week is pending approval or approved. */
    locked: isLockedStatus(submission?.status),
    /** The week was submitted from a different zone than it is viewed in. */
    timeZoneMismatch: submission ? submission.timeZone !== options.timeZone : false,
    serverTime: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Admin overview (every member, one week)
// ---------------------------------------------------------------------------

export interface TimesheetOverviewOptions {
  actorId: string;
  workspaceId?: string | null;
  /** Monday day key */
  weekStart: DayKey;
  /** The viewer's zone; every member's entries are bucketed in it. */
  timeZone: string;
  /** Only members of this channel; it must be visible to the actor. */
  channelId?: string | null;
}

const overviewChannelSelect = {
  id: true,
  name: true,
  isPrivate: true,
} satisfies Prisma.ChannelSelect;

/**
 * One row per workspace member for one week: per-day and weekly totals in the
 * viewer's zone, the member's submission for that week and whether a timer is
 * running right now. Admins only. "Groups" are channels: `channelId` narrows
 * the rows to that channel's members.
 */
export async function getTimesheetOverview(options: TimesheetOverviewOptions) {
  assertWeekArguments(options.weekStart, options.timeZone);

  const workspaceId = await resolveWorkspaceId(options.actorId, options.workspaceId);
  const actorMembership = await requireWorkspaceAdmin(workspaceId, options.actorId);

  // Same visibility rule as /api/channels and /api/bootstrap: no DMs, and
  // private channels only when the admin belongs to them.
  const channels = await db.channel.findMany({
    where: {
      workspaceId,
      type: ChannelType.CHANNEL,
      OR: [{ isPrivate: false }, { members: { some: { userId: options.actorId } } }],
    },
    select: overviewChannelSelect,
    orderBy: { name: "asc" },
  });

  const channelId = options.channelId || null;

  if (channelId && !channels.some((channel) => channel.id === channelId)) {
    // Another workspace, a DM, or a private channel the admin is not in.
    throw new AccessError("Channel not found", 404);
  }

  const members = await db.workspaceMember.findMany({
    where: {
      workspaceId,
      ...(channelId ? { user: { channelMemberships: { some: { channelId } } } } : {}),
    },
    select: {
      userId: true,
      role: true,
      user: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
  });

  const memberIds = members.map((member) => member.userId);
  const { days, from, to } = weekUtcWindow(options.weekStart);

  const [workspace, rawEntries, submissions, timers, pendingCount] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, name: true },
    }),
    // One query for everyone inside the ±26h window; aggregateByUser applies
    // the exact day-key filter, exactly as loadWeekEntries does per user.
    db.timeEntry.findMany({
      where: {
        workspaceId,
        userId: { in: memberIds },
        startedAt: { gte: from, lt: to },
        NOT: { entryType: TimeEntryType.TIMER, endedAt: null },
      },
      select: { userId: true, startedAt: true, durationSeconds: true },
    }),
    db.timesheetSubmission.findMany({
      where: { workspaceId, weekStart: options.weekStart, userId: { in: memberIds } },
      include: timesheetSubmissionInclude,
    }),
    db.timeEntry.findMany({
      where: {
        workspaceId,
        userId: { in: memberIds },
        entryType: TimeEntryType.TIMER,
        endedAt: null,
      },
      select: { userId: true, startedAt: true },
    }),
    db.timesheetSubmission.count({
      where: { workspaceId, status: TimesheetStatus.SUBMITTED },
    }),
  ]);

  const totals = aggregateByUser(rawEntries, days, options.timeZone, memberIds);
  const submissionByUser = new Map(submissions.map((submission) => [submission.userId, submission]));
  const timerByUser = new Map(timers.map((timer) => [timer.userId, timer]));

  return {
    viewer: { id: options.actorId, role: actorMembership.role },
    workspace,
    weekStart: options.weekStart,
    days,
    timeZone: options.timeZone,
    channels,
    channelId,
    members: members.map((member) => {
      const running = timerByUser.get(member.userId) ?? null;
      const week = totals[member.userId];

      return {
        user: member.user,
        role: member.role,
        /** Reference capacity; no per-user schedule exists yet. */
        capacitySeconds: WEEK_CAPACITY_SECONDS,
        byDay: week.byDay,
        weekSeconds: week.week,
        submission: submissionByUser.get(member.userId) ?? null,
        running: running !== null,
        runningSince: running?.startedAt ?? null,
      };
    }),
    /** Workspace-wide, for the Approvals badge; not narrowed by channel or week. */
    pendingCount,
    serverTime: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Submissions (approval workflow)
// ---------------------------------------------------------------------------

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export interface SubmitTimesheetOptions {
  actorId: string;
  workspaceId?: string | null;
  /** Monday day key */
  weekStart: DayKey;
  /** Zone the week is viewed in; the lock is judged in this zone from now on. */
  timeZone: string;
  note?: string | null;
}

/**
 * Submits the actor's week for approval, or resubmits a rejected one. The
 * total is computed here with the same window and filter as the timesheet.
 */
export async function submitTimesheet(options: SubmitTimesheetOptions) {
  assertWeekArguments(options.weekStart, options.timeZone);

  const workspaceId = await resolveWorkspaceId(options.actorId, options.workspaceId);
  const now = new Date();

  if (isFutureWeek(options.weekStart, now, options.timeZone)) {
    throw new TimeEntryValidationError("This week hasn't started yet");
  }

  const key = { workspaceId, userId: options.actorId, weekStart: options.weekStart };

  return db.$transaction(async (tx) => {
    await lockMemberRow(tx, workspaceId, options.actorId);

    const existing = await tx.timesheetSubmission.findUnique({
      where: { workspaceId_userId_weekStart: key },
      select: { id: true, status: true },
    });

    if (existing && existing.status !== TimesheetStatus.REJECTED) {
      throw new TimesheetConflictError(
        existing.status === TimesheetStatus.APPROVED
          ? "This week has already been approved"
          : "This week is already pending approval",
      );
    }

    const running = await tx.timeEntry.findFirst({
      where: {
        workspaceId,
        userId: options.actorId,
        entryType: TimeEntryType.TIMER,
        endedAt: null,
      },
      select: { startedAt: true },
    });

    if (running && weekContainsInstant(options.weekStart, options.timeZone, running.startedAt)) {
      throw new TimesheetConflictError("Stop your timer before submitting this week");
    }

    const { days, entries } = await loadWeekEntries(tx, {
      workspaceId,
      userId: options.actorId,
      weekStart: options.weekStart,
      timeZone: options.timeZone,
    });

    const data = {
      timeZone: options.timeZone,
      status: TimesheetStatus.SUBMITTED,
      totalSeconds: aggregateEntries(entries, days, options.timeZone).week,
      note: cleanNote(options.note),
      submittedAt: now,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    };

    if (existing) {
      // Resubmission after a rejection: same row, fresh snapshot, review cleared.
      // The reviewer assignment is kept on purpose so the same admin follows up.
      const updated = await tx.timesheetSubmission.updateMany({
        where: { id: existing.id, status: TimesheetStatus.REJECTED },
        data,
      });

      if (updated.count === 0) {
        throw new TimesheetConflictError("This week is already pending approval");
      }

      return tx.timesheetSubmission.findUniqueOrThrow({
        where: { id: existing.id },
        include: timesheetSubmissionInclude,
      });
    }

    try {
      return await tx.timesheetSubmission.create({
        data: { ...key, ...data },
        include: timesheetSubmissionInclude,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TimesheetConflictError("This week is already pending approval");
      }

      throw error;
    }
  });
}

/** Takes back the actor's pending submission; the week becomes editable again. */
export async function withdrawTimesheet(options: {
  actorId: string;
  workspaceId?: string | null;
  weekStart: DayKey;
}) {
  if (isoWeekday(options.weekStart) !== 1) {
    throw new TimeEntryValidationError("week must be a Monday (YYYY-MM-DD)");
  }

  const workspaceId = await resolveWorkspaceId(options.actorId, options.workspaceId);
  const key = { workspaceId, userId: options.actorId, weekStart: options.weekStart };

  const result = await db.timesheetSubmission.deleteMany({
    where: { ...key, status: TimesheetStatus.SUBMITTED },
  });

  if (result.count === 0) {
    const current = await db.timesheetSubmission.findUnique({
      where: { workspaceId_userId_weekStart: key },
      select: { status: true },
    });

    throw new TimesheetConflictError(
      current?.status === TimesheetStatus.APPROVED
        ? "This week has been approved; only an admin can reopen it"
        : current?.status === TimesheetStatus.REJECTED
          ? "This week was rejected, so there is nothing to withdraw"
          : "This week has not been submitted",
    );
  }
}

export interface ApprovalsFilter {
  status?: TimesheetStatus | null;
  /** Only submissions assigned to this admin. */
  assignedToId?: string | null;
  /** Only submissions nobody is assigned to (ignored when assignedToId is set). */
  unassignedOnly?: boolean;
  /** Only this submitter. */
  userId?: string | null;
  /** Only this week (Monday key). */
  weekStart?: DayKey | null;
}

export interface ListApprovalsOptions extends ApprovalsFilter {
  actorId: string;
  workspaceId?: string | null;
}

/**
 * Submissions in the workspace, newest first, with per-status counts and the
 * admins a submission may be assigned to. Admins only. The counts honour every
 * filter except `status`, so they describe the status tabs the viewer can
 * switch to without changing their other filters.
 */
export async function listApprovals(options: ListApprovalsOptions) {
  const workspaceId = await resolveWorkspaceId(options.actorId, options.workspaceId);
  await requireWorkspaceAdmin(workspaceId, options.actorId);

  if (options.weekStart && isoWeekday(options.weekStart) !== 1) {
    throw new TimeEntryValidationError("week must be a Monday (YYYY-MM-DD)");
  }

  const scope: Prisma.TimesheetSubmissionWhereInput = {
    workspaceId,
    ...(options.assignedToId
      ? { assignedToId: options.assignedToId }
      : options.unassignedOnly
        ? { assignedToId: null }
        : {}),
    ...(options.userId ? { userId: options.userId } : {}),
    ...(options.weekStart ? { weekStart: options.weekStart } : {}),
  };

  const [submissions, grouped, admins] = await Promise.all([
    db.timesheetSubmission.findMany({
      where: { ...scope, ...(options.status ? { status: options.status } : {}) },
      include: timesheetSubmissionInclude,
      orderBy: [{ submittedAt: "desc" }],
    }),
    db.timesheetSubmission.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
    db.workspaceMember.findMany({
      where: { workspaceId, role: { in: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] } },
      select: { role: true, user: { select: { id: true, name: true, avatar: true } } },
      orderBy: [{ user: { name: "asc" } }],
    }),
  ]);

  return {
    submissions,
    counts: statusCountsFrom(
      grouped.map((row) => ({ status: row.status, count: row._count._all })),
    ),
    admins: admins.map((member) => ({ ...member.user, role: member.role })),
  };
}

/**
 * Approves or rejects a submission. A pending week can go either way; an
 * approved week can be rejected again, which reopens it for editing. Admins
 * may review their own weeks.
 */
export async function reviewTimesheet(options: {
  actorId: string;
  submissionId: string;
  status: "APPROVED" | "REJECTED";
  reviewNote?: string | null;
}) {
  const submission = await db.timesheetSubmission.findUnique({
    where: { id: options.submissionId },
    select: { id: true, workspaceId: true },
  });

  if (!submission) {
    throw new AccessError("Submission not found", 404);
  }

  await requireWorkspaceAdmin(submission.workspaceId, options.actorId);

  const reviewable: TimesheetStatus[] =
    options.status === TimesheetStatus.APPROVED
      ? [TimesheetStatus.SUBMITTED]
      : [TimesheetStatus.SUBMITTED, TimesheetStatus.APPROVED];

  const updated = await db.timesheetSubmission.updateMany({
    where: { id: submission.id, status: { in: reviewable } },
    data: {
      status: options.status,
      reviewedById: options.actorId,
      reviewedAt: new Date(),
      reviewNote: cleanNote(options.reviewNote),
    },
  });

  if (updated.count === 0) {
    throw new TimesheetConflictError(
      options.status === TimesheetStatus.APPROVED
        ? "Only a pending submission can be approved"
        : "This submission has already been rejected",
    );
  }

  return db.timesheetSubmission.findUniqueOrThrow({
    where: { id: submission.id },
    include: timesheetSubmissionInclude,
  });
}

/**
 * Assigns a submission to an admin as the person responsible for reviewing
 * it, or clears the assignment with `assigneeId: null`. Allowed in every
 * status: assignment is a responsibility marker, not a workflow state, and
 * any admin may still approve or reject. Admins may assign themselves.
 */
export async function assignTimesheet(options: {
  actorId: string;
  submissionId: string;
  /** OWNER/ADMIN of the submission's workspace, or null to unassign. */
  assigneeId: string | null;
}) {
  const submission = await db.timesheetSubmission.findUnique({
    where: { id: options.submissionId },
    select: { id: true, workspaceId: true },
  });

  if (!submission) {
    throw new AccessError("Submission not found", 404);
  }

  await requireWorkspaceAdmin(submission.workspaceId, options.actorId);

  if (options.assigneeId) {
    const assignee = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: submission.workspaceId, userId: options.assigneeId },
      },
      select: { role: true },
    });

    if (!assignee || !isWorkspaceAdminRole(assignee.role)) {
      throw new TimeEntryValidationError(
        "Timesheets can only be assigned to an admin or owner of this workspace",
      );
    }
  }

  const updated = await db.timesheetSubmission.updateMany({
    where: { id: submission.id },
    data: options.assigneeId
      ? { assignedToId: options.assigneeId, assignedById: options.actorId, assignedAt: new Date() }
      : { assignedToId: null, assignedById: null, assignedAt: null },
  });

  if (updated.count === 0) {
    // Withdrawn between the read and the write.
    throw new AccessError("Submission not found", 404);
  }

  return db.timesheetSubmission.findUniqueOrThrow({
    where: { id: submission.id },
    include: timesheetSubmissionInclude,
  });
}

/**
 * Drops `userId` as the assignee of every submission in the workspace. Called
 * when an admin is demoted to member or removed from the workspace, so the
 * Approvals queue never points at someone who can no longer review.
 */
export function clearTimesheetAssignments(client: DbClient, workspaceId: string, userId: string) {
  return client.timesheetSubmission.updateMany({
    where: { workspaceId, assignedToId: userId },
    data: { assignedToId: null, assignedById: null, assignedAt: null },
  });
}
