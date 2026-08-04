import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { meetings, meetingAttendees, workspaceMembers, users, tasks, lists, projects, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { PUBLIC_USER_COLUMNS } from '../../common/permissions/public-user'
import { AiService } from '../ai/ai.service'
import { TasksService } from '../tasks/tasks.service'

const MAX_TITLE = 300

/**
 * Meeting records.
 *
 * Starting a meeting from a task already worked; nothing was kept afterwards.
 * This is the record — who was there, what was said, where the recording is —
 * so the notes the AI can already read have somewhere to live, and the action
 * items it extracts can be turned into real tasks against a real meeting.
 */
@Injectable()
export class MeetingsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly ai: AiService,
    private readonly tasksService: TasksService,
  ) {}

  private async assertMember(workspaceId: string, userId: string) {
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!m) throw new ForbiddenException('Workspace membership required')
    return m
  }

  /** Scoped by workspace, so an id from another tenant reads as missing. */
  private async load(workspaceId: string, meetingId: string) {
    const [row] = await this.db
      .select()
      .from(meetings)
      .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)))
      .limit(1)
    if (!row) throw new NotFoundException('Meeting not found')
    return row
  }

  private async attendeesFor(meetingIds: string[]) {
    if (!meetingIds.length) return new Map<string, unknown[]>()
    const rows = await this.db
      .select({
        id: meetingAttendees.id,
        meetingId: meetingAttendees.meetingId,
        email: meetingAttendees.email,
        name: meetingAttendees.name,
        user: PUBLIC_USER_COLUMNS,
      })
      .from(meetingAttendees)
      .leftJoin(users, eq(users.id, meetingAttendees.userId))
      .where(inArray(meetingAttendees.meetingId, meetingIds))
    const byMeeting = new Map<string, unknown[]>()
    for (const r of rows) {
      const list = byMeeting.get(r.meetingId) ?? []
      // A member row carries a user; an outsider carries only name/email.
      list.push({ id: r.id, name: r.user?.displayName ?? r.name, email: r.user?.email ?? r.email, user: r.user?.id ? r.user : null })
      byMeeting.set(r.meetingId, list)
    }
    return byMeeting
  }

  async list(workspaceId: string, userId: string, opts: { taskId?: string } = {}) {
    await this.assertMember(workspaceId, userId)
    const rows = await this.db
      .select()
      .from(meetings)
      .where(
        opts.taskId
          ? and(eq(meetings.workspaceId, workspaceId), eq(meetings.taskId, opts.taskId))
          : eq(meetings.workspaceId, workspaceId),
      )
      // Newest first, and meetings with no start time fall back to when the
      // record was made rather than sorting to the bottom forever.
      .orderBy(desc(meetings.startsAt), desc(meetings.createdAt))
      .limit(200)
    const attendees = await this.attendeesFor(rows.map((r) => r.id))
    return rows.map((r) => ({ ...r, attendees: attendees.get(r.id) ?? [] }))
  }

  async get(workspaceId: string, meetingId: string, userId: string) {
    await this.assertMember(workspaceId, userId)
    const row = await this.load(workspaceId, meetingId)
    const attendees = await this.attendeesFor([row.id])
    return { ...row, attendees: attendees.get(row.id) ?? [] }
  }

  async create(
    workspaceId: string,
    userId: string,
    body: {
      title: string
      startsAt?: string | null
      endsAt?: string | null
      provider?: 'zoom' | 'google_meet' | 'manual'
      joinUrl?: string | null
      notes?: string | null
      taskId?: string | null
      attendeeIds?: string[]
    },
  ) {
    await this.assertMember(workspaceId, userId)
    const title = (body.title ?? '').trim()
    if (!title) throw new BadRequestException('title is required')
    if (title.length > MAX_TITLE) throw new BadRequestException(`title must be ${MAX_TITLE} characters or fewer`)

    if (body.taskId) await this.assertTaskInWorkspace(workspaceId, body.taskId)

    const [row] = await this.db
      .insert(meetings)
      .values({
        workspaceId,
        title,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        provider: body.provider ?? 'manual',
        joinUrl: body.joinUrl ?? null,
        notes: body.notes ?? null,
        taskId: body.taskId ?? null,
        createdById: userId,
      })
      .returning()

    // The organiser is an attendee — a meeting nobody attended is a mistake,
    // not a record.
    const ids = [...new Set([userId, ...(body.attendeeIds ?? [])])]
    await this.setAttendees(workspaceId, row.id, ids)
    return this.get(workspaceId, row.id, userId)
  }

  private async assertTaskInWorkspace(workspaceId: string, taskId: string) {
    const [t] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(tasks.id, taskId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!t) throw new NotFoundException('Task not found in this workspace')
  }

  /** Replace the member attendee set. Outsiders are added separately. */
  private async setAttendees(workspaceId: string, meetingId: string, userIds: string[]) {
    if (!userIds.length) return
    const members = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, userIds)))
    const valid = members.map((m) => m.userId)
    if (!valid.length) return
    await this.db
      .insert(meetingAttendees)
      .values(valid.map((uid) => ({ meetingId, userId: uid })))
      .onConflictDoNothing()
  }

  async update(
    workspaceId: string,
    meetingId: string,
    userId: string,
    body: {
      title?: string
      notes?: string | null
      transcript?: string | null
      recordingUrl?: string | null
      startsAt?: string | null
      endsAt?: string | null
    },
  ) {
    await this.assertMember(workspaceId, userId)
    await this.load(workspaceId, meetingId)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (body.title !== undefined) {
      const t = body.title.trim()
      if (!t) throw new BadRequestException('title cannot be empty')
      set.title = t.slice(0, MAX_TITLE)
    }
    for (const k of ['notes', 'transcript', 'recordingUrl'] as const) {
      if (body[k] !== undefined) set[k] = body[k]
    }
    if (body.startsAt !== undefined) set.startsAt = body.startsAt ? new Date(body.startsAt) : null
    if (body.endsAt !== undefined) set.endsAt = body.endsAt ? new Date(body.endsAt) : null
    await this.db
      .update(meetings)
      .set(set)
      .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)))
    return this.get(workspaceId, meetingId, userId)
  }

  async remove(workspaceId: string, meetingId: string, userId: string) {
    await this.assertMember(workspaceId, userId)
    await this.load(workspaceId, meetingId)
    await this.db.delete(meetings).where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)))
    return { ok: true }
  }

  async addAttendee(
    workspaceId: string,
    meetingId: string,
    userId: string,
    body: { userId?: string; email?: string; name?: string },
  ) {
    await this.assertMember(workspaceId, userId)
    await this.load(workspaceId, meetingId)
    if (body.userId) {
      await this.setAttendees(workspaceId, meetingId, [body.userId])
    } else {
      const email = (body.email ?? '').trim()
      if (!email) throw new BadRequestException('userId or email is required')
      await this.db.insert(meetingAttendees).values({ meetingId, email, name: (body.name ?? '').trim() || null })
    }
    return this.get(workspaceId, meetingId, userId)
  }

  async removeAttendee(workspaceId: string, meetingId: string, attendeeId: string, userId: string) {
    await this.assertMember(workspaceId, userId)
    await this.load(workspaceId, meetingId)
    const [row] = await this.db
      .delete(meetingAttendees)
      .where(and(eq(meetingAttendees.meetingId, meetingId), eq(meetingAttendees.id, attendeeId)))
      .returning()
    if (!row) throw new NotFoundException('Attendee not found')
    return { ok: true }
  }

  /**
   * Pull action items out of this meeting's notes.
   *
   * The extraction already existed but had no meeting to read from, so the
   * caller had to paste the notes in and the result belonged to nothing. With
   * `createIn` the items become real tasks in a list, which is the half that
   * makes the loop close.
   */
  async extractActionItems(
    workspaceId: string,
    meetingId: string,
    userId: string,
    opts: { createIn?: string } = {},
  ) {
    await this.assertMember(workspaceId, userId)
    const meeting = await this.load(workspaceId, meetingId)
    const source = (meeting.notes ?? '').trim() || (meeting.transcript ?? '').trim()
    if (!source) throw new BadRequestException('This meeting has no notes or transcript to read')
    if (!this.ai.isAvailable()) throw new BadRequestException('AI features are not configured')

    const extracted = await this.ai.extractTasksFromNotes(source, { userId, workspaceId })
    const items: Array<{ title: string; description?: string }> = Array.isArray(extracted)
      ? extracted
      : ((extracted as { tasks?: unknown[] })?.tasks as Array<{ title: string; description?: string }>) ?? []

    if (!opts.createIn) return { items, created: [] as Array<{ id: string; title: string }> }

    // Creating them is what turns a summary into work someone will see.
    const created: Array<{ id: string; title: string }> = []
    for (const item of items) {
      const title = (item?.title ?? '').trim()
      if (!title) continue
      const task = await this.tasksService.createTask({
        listId: opts.createIn,
        title,
        description: item.description ?? `From meeting: ${meeting.title}`,
        createdById: userId,
      })
      // createTask can return null when the list rejects the write; skip
      // rather than reporting a task that was never made.
      if (task?.id) created.push({ id: task.id, title: task.title })
    }
    return { items, created }
  }
}
