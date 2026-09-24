import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import { meetings, meetingAttendees, workspaceMembers, users, tasks, taskAssignees, lists, projects, spaces, calls, callRecordings } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { PUBLIC_USER_COLUMNS } from '../../common/permissions/public-user'
import { resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'
import { containerVisibilityFilter } from '../../common/permissions/container-access.guard-helper'
import { readableTask } from '../../common/permissions/read-access'
import { taskTypeIdForOrigin } from '../../common/task-types/origin'
import { AiService } from '../ai/ai.service'
import { R2Service } from '../../common/storage/r2.service'
import { TasksService } from '../tasks/tasks.service'
import { isCallRecordingKeyFor, isWorkspaceCallRecordingKey } from '../calls/call-recording-keys'

const MAX_TITLE = 300

/**
 * Meeting records.
 *
 * Starting a meeting from a task already worked; nothing was kept afterwards.
 * This is the record — who was there, what was said, where the recording is —
 * so the notes the AI can already read have somewhere to live, and the action
 * items it extracts can be turned into real tasks against a real meeting.
 */

/**
 * §A6 [19:16–19:20] — the tags on a meeting note, cleaned once.
 *
 * Trimmed, de-duplicated case-insensitively (so "Standup" and "standup" are one
 * chip, not two that look identical in the toolbar), blanks dropped, and
 * bounded. A tag list is chips on a filter bar: a hundred of them, or one
 * three-thousand characters long, is not a filter any more.
 */
export function normalizeMeetingTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim().slice(0, 40)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 20) break
  }
  return out
}

@Injectable()
export class MeetingsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly ai: AiService,
    private readonly tasksService: TasksService,
    private readonly r2: R2Service,
  ) {}

  /**
   * §2.8 gap 10 — turn a stored recording pointer into something playable.
   *
   * `recordingUrl` holds two different things and always has: a URL somebody
   * pasted in (a Zoom link, a Drive file), and — since calls started leaving
   * recordings behind — a storage key for a file we hold ourselves.
   *
   * They are safely told apart because a storage key has no scheme. That
   * matters because signing is not optional here: R2 signed URLs last fifteen
   * minutes, so a signed URL written into this column is a dead link before
   * the meeting notes have been read once. The key is what is durable; the URL
   * is made fresh on the way out, exactly as chat attachments already do.
   */
  private async playableRecording(stored: string | null, workspaceId: string): Promise<string | null> {
    if (!stored) return null
    // A pasted link: http(s) only. This passed anything containing `://`, so
    // `javascript://…` came back as a recording link to be drawn as an href.
    if (/^https?:\/\//i.test(stored)) return stored
    // A key: only a recording of one of THIS workspace's calls. This signed
    // whatever the column named, so a member who stored another tenant's key
    // was handed a working URL to it.
    if (!isWorkspaceCallRecordingKey(stored, workspaceId)) return null
    if (!this.r2.configured) return stored
    return this.r2.getObjectUrl(stored).catch(() => null)
  }

  /**
   * What a CLIENT may put in `recordingUrl`: nothing, a pasted http(s) link,
   * or what is already there, unchanged. Keys are written by the server alone
   * (calls.service attachRecording) — a client that could name one could name
   * another tenant's.
   *
   * THE ROUND TRIP IS NOT A CHANGE. The AI page's meeting card loads the
   * signed URL the GET hands out and sends it back on every Update, which wrote
   * a fifteen-minute URL over the durable key: the recording died a quarter of
   * an hour later. A URL of our own bucket naming the key already stored keeps
   * the key; one naming any other object of ours is refused.
   */
  /** What a new meeting's pointer holds: the server's own key when it passed one, else the client's input. */
  private recordingForCreate(workspaceId: string, input: string | null | undefined, serverKey?: string | null): string | null {
    if (serverKey) {
      // Checked by shape even so — a server path that one day passes the wrong
      // thing should fail here, not sign it for every reader.
      if (!isWorkspaceCallRecordingKey(serverKey, workspaceId)) throw new BadRequestException('Not a recording of this workspace')
      return serverKey
    }
    return this.acceptRecordingInput(input, null)
  }

  private acceptRecordingInput(input: string | null | undefined, stored: string | null): string | null {
    const value = typeof input === 'string' ? input.trim() : null
    if (!value) return null
    if (value === stored) return stored
    const own = this.r2.keyFromOwnUrl(value)
    if (own !== null) {
      if (own === stored) return stored
      throw new BadRequestException("That link points into this workspace's own storage; a recording there belongs to the call that made it")
    }
    if (!/^https?:\/\/\S+$/i.test(value)) throw new BadRequestException('A recording link must start with http:// or https://')
    return value
  }

  /**
   * §2.8 — every piece of a call's recording, playable, per meeting.
   *
   * Recording is a toggle: a call can be recorded, stopped for a private aside
   * and recorded again, and each stop produces its own file. `call_recordings`
   * has kept all of them since 0111, but nothing ever read that table — the
   * meeting still showed the single key on `meetings.recordingUrl`, so the
   * second and later pieces were bytes in storage that no route, no service
   * and no screen could reach. This is the read the table was made for.
   *
   * Reached through the call rather than through the meeting, because that is
   * the direction the link points (`calls.meeting_id`), and it means a piece
   * that finishes uploading AFTER the call ended still joins its record with
   * no backfill of its own.
   */
  private async recordingsFor(meetingIds: string[]) {
    const byMeeting = new Map<string, string[]>()
    if (!meetingIds.length) return byMeeting
    const rows = await this.db
      .select({
        meetingId: calls.meetingId,
        storageKey: callRecordings.storageKey,
        callId: calls.id,
        workspaceId: calls.workspaceId,
      })
      .from(callRecordings)
      .innerJoin(calls, eq(calls.id, callRecordings.callId))
      .where(inArray(calls.meetingId, meetingIds))
      .orderBy(asc(calls.meetingId), asc(callRecordings.position))
    for (const r of rows) {
      if (!r.meetingId) continue
      // Only this call's own recording — the key is signed, so it must be one.
      if (!isCallRecordingKeyFor(r.storageKey, r.workspaceId, r.callId)) continue
      const playable = await this.playableRecording(r.storageKey, r.workspaceId)
      if (!playable) continue
      const list = byMeeting.get(r.meetingId) ?? []
      list.push(playable)
      byMeeting.set(r.meetingId, list)
    }
    return byMeeting
  }

  /**
   * A meeting on its way out: the recording pointer signed, and every piece of
   * a call recording alongside it.
   *
   * `recordingUrl` stays exactly what it was — the one link a meeting has
   * always had, whether pasted in or captured here — so nothing that reads it
   * changes meaning. `recordings` is the whole of what was captured, in order,
   * and is empty for a meeting that was never a call.
   */
  private async withRecordings<T extends { id: string; workspaceId: string; recordingUrl: string | null }>(rows: T[]) {
    const bySegment = await this.recordingsFor(rows.map((r) => r.id))
    return Promise.all(
      rows.map(async (r) => ({
        ...r,
        recordingUrl: await this.playableRecording(r.recordingUrl, r.workspaceId),
        recordings: bySegment.get(r.id) ?? [],
      })),
    )
  }

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
    const [withSegments] = await this.withRecordings([row])
    return withSegments
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

  async list(workspaceId: string, userId: string, opts: { taskId?: string; tag?: string } = {}) {
    await this.assertMember(workspaceId, userId)
    /*
     * §A6 [19:16–19:20] — filtered in SQL, not after the limit.
     *
     * This caps at 200. Fetching 200 and then filtering by tag in the client
     * would make a tag on the 201st meeting unreachable — the same shape as
     * the forward modal's ten-item cap, where narrowing after slicing put the
     * thing you searched for permanently out of reach.
     */
    const tag = opts.tag?.trim()
    const rows = await this.db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          opts.taskId ? eq(meetings.taskId, opts.taskId) : undefined,
          tag ? sql`${meetings.tags} @> ARRAY[${tag}]::text[]` : undefined,
        ),
      )
      // Newest first, and meetings with no start time fall back to when the
      // record was made rather than sorting to the bottom forever.
      .orderBy(desc(meetings.startsAt), desc(meetings.createdAt))
      .limit(200)
    const attendees = await this.attendeesFor(rows.map((r) => r.id))
    /*
     * Signed HERE too, not only in load().
     *
     * The meetings page renders its Recording link straight from this list, and
     * a recording captured in a SyncUp is stored as a bare storage key. Handed
     * out unsigned it is not a URL at all — the browser resolves it against the
     * current page and the link 404s. Only the single-meeting read signed it,
     * so the one place recordings are actually browsed was the one place they
     * did not work.
     */
    const withRecordings = await this.withRecordings(rows)
    return withRecordings.map((r) => ({ ...r, attendees: attendees.get(r.id) ?? [] }))
  }

  /**
   * §2.8 — the "Upcoming Meetings" block, with a Join pill and a countdown.
   *
   * Split on the SERVER against `now()` rather than filtered in the browser:
   * a client clock that is wrong — a laptop woken from sleep, a machine in the
   * wrong timezone — would move a meeting between "upcoming" and "past" with
   * nothing to say it had, and the person would simply not be told about a call
   * that is about to start.
   */
  async upcoming(workspaceId: string, userId: string, now: Date = new Date()) {
    await this.assertMember(workspaceId, userId)
    const rows = await this.db
      .select()
      .from(meetings)
      .where(and(eq(meetings.workspaceId, workspaceId), gte(meetings.startsAt, now)))
      // Soonest first: the one about to start is the one being looked for.
      .orderBy(asc(meetings.startsAt))
      .limit(10)
    const attendees = await this.attendeesFor(rows.map((r) => r.id))
    const withRecordings = await this.withRecordings(rows)
    return withRecordings.map((r) => ({ ...r, attendees: attendees.get(r.id) ?? [] }))
  }

  /**
   * §2.8 — what the meetings ask-box answers from.
   *
   * Notes are truncated per meeting rather than the list being cut short: a
   * question like "what did I miss this week" is answered badly by three
   * meetings in full and wrongly by none of the others.
   */
  async recentForAi(workspaceId: string, userId: string, limit = 20) {
    await this.assertMember(workspaceId, userId)
    const rows = await this.db
      .select({
        id: meetings.id,
        title: meetings.title,
        startsAt: meetings.startsAt,
        notes: meetings.notes,
        createdAt: meetings.createdAt,
      })
      .from(meetings)
      .where(eq(meetings.workspaceId, workspaceId))
      .orderBy(desc(meetings.startsAt), desc(meetings.createdAt))
      .limit(limit)
    const attendees = await this.attendeesFor(rows.map((r) => r.id))
    return rows.map((r) => ({
      ...r,
      notes: r.notes ? r.notes.slice(0, 1200) : null,
      attendees: ((attendees.get(r.id) ?? []) as Array<{ name?: string | null; email?: string | null }>)
        .map((a) => a.name ?? a.email ?? 'someone'),
    }))
  }

  /**
   * §2.8 — the ask-box. The membership check and the read live here; the AI
   * only sees records this person is already allowed to see.
   */
  async ask(workspaceId: string, userId: string, question: string) {
    const asked = (question ?? '').trim()
    if (!asked) throw new BadRequestException('Ask something about your meetings')
    const context = await this.recentForAi(workspaceId, userId)
    return this.ai.askAboutMeetings(asked, context, { userId, workspaceId })
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
      recordingUrl?: string | null
      notes?: string | null
      tags?: string[]
      taskId?: string | null
      attendeeIds?: string[]
    },
    /**
     * SERVER-ONLY: a recording this server wrote itself — a call's recording
     * key, passed by calls.service when the call ends. The route passes `body`
     * alone, so no client reaches this; `body.recordingUrl` is what a client
     * sends, and a key there is refused (acceptRecordingInput).
     *
     * It is a separate parameter because the first version of the client rule
     * went through `body` for both, refused the call's own key, and the
     * `.catch` around the call's create swallowed it: every recorded call ended
     * with no meeting record. `syncup-live` caught it the same afternoon.
     */
    internal: { recordingKey?: string | null } = {},
  ) {
    await this.assertMember(workspaceId, userId)
    const title = (body.title ?? '').trim()
    if (!title) throw new BadRequestException('title is required')
    if (title.length > MAX_TITLE) throw new BadRequestException(`title must be ${MAX_TITLE} characters or fewer`)

    if (body.taskId) await this.assertTaskOpenTo(workspaceId, body.taskId, userId)

    const [row] = await this.db
      .insert(meetings)
      .values({
        workspaceId,
        title,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        provider: body.provider ?? 'manual',
        joinUrl: body.joinUrl ?? null,
        recordingUrl: this.recordingForCreate(workspaceId, body.recordingUrl, internal.recordingKey),
        notes: body.notes ?? null,
        taskId: body.taskId ?? null,
        createdById: userId,
        tags: normalizeMeetingTags(body.tags),
      })
      .returning()

    // The organiser is an attendee — a meeting nobody attended is a mistake,
    // not a record.
    const ids = [...new Set([userId, ...(body.attendeeIds ?? [])])]
    await this.setAttendees(workspaceId, row.id, ids)
    return this.get(workspaceId, row.id, userId)
  }

  /** The destination of a meeting's action items: see extractActionItems. A seam, so a unit test can stand in for it. */
  protected async assertCanMakeTasksIn(workspaceId: string, listId: string, userId: string) {
    // The one rule for making a task (`TasksService.assertCanCreateTaskIn`),
    // and a list of THIS meeting's workspace.
    const home = await this.tasksService.assertCanCreateTaskIn(listId, userId)
    if (home.workspaceId !== workspaceId) throw new NotFoundException('List not found')
  }

  /**
   * A meeting is linked only to a task its maker may open. This asked only
   * that the task was in the workspace, so a member linked meetings — and
   * their notes — to a private task they are refused, and learnt from the 201
   * that the id was a task.
   */
  private async assertTaskOpenTo(workspaceId: string, taskId: string, userId: string) {
    if (!(await readableTask(this.db, workspaceId, taskId, { id: userId }))) {
      throw new NotFoundException('Task not found in this workspace')
    }
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
      tags?: string[]
    },
  ) {
    await this.assertMember(workspaceId, userId)
    await this.load(workspaceId, meetingId)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (body.recordingUrl !== undefined) {
      // Compared with what is STORED, not with what load() hands back — that
      // is the signed URL, which is the thing this must not write.
      const [stored] = await this.db
        .select({ recordingUrl: meetings.recordingUrl })
        .from(meetings)
        .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)))
        .limit(1)
      set.recordingUrl = this.acceptRecordingInput(body.recordingUrl, stored?.recordingUrl ?? null)
    }
    // Absent means "leave the tags alone"; an empty array means "remove them
    // all", which is a real answer. Conflating the two is how a clear becomes
    // impossible — the defect this repo already fixed on nav favourites.
    if (body.tags !== undefined) set.tags = normalizeMeetingTags(body.tags)
    if (body.title !== undefined) {
      const t = body.title.trim()
      if (!t) throw new BadRequestException('title cannot be empty')
      set.title = t.slice(0, MAX_TITLE)
    }
    for (const k of ['notes', 'transcript'] as const) {
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
   * What two people share: the meetings they both attended, and the open tasks
   * either of them is assigned to.
   *
   * This is what sits behind a DM's Calendar and Tasks tabs. A DM is the one
   * place where "what are we both on?" is the actual question, and answering it
   * needed no new storage — meetings know their attendees and tasks know their
   * assignees, so it is two joins rather than a new concept.
   */
  async sharedWith(workspaceId: string, otherUserId: string, userId: string) {
    await this.assertMember(workspaceId, userId)
    if (otherUserId === userId) throw new BadRequestException('Pick someone other than yourself')
    const other = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, otherUserId)))
      .limit(1)
    if (!other.length) throw new NotFoundException('That person is not in this workspace')

    // Meetings both of us attended: two passes over the attendee table rather
    // than a self-join, which keeps the "both" condition obvious.
    const mine = await this.db
      .select({ meetingId: meetingAttendees.meetingId })
      .from(meetingAttendees)
      .innerJoin(meetings, eq(meetings.id, meetingAttendees.meetingId))
      .where(and(eq(meetings.workspaceId, workspaceId), eq(meetingAttendees.userId, userId)))
    const theirs = await this.db
      .select({ meetingId: meetingAttendees.meetingId })
      .from(meetingAttendees)
      .where(eq(meetingAttendees.userId, otherUserId))
    const theirSet = new Set(theirs.map((r) => r.meetingId))
    const bothIds = [...new Set(mine.map((r) => r.meetingId))].filter((id) => theirSet.has(id))

    const sharedMeetings = bothIds.length
      ? await this.db
          .select({
            id: meetings.id,
            title: meetings.title,
            startsAt: meetings.startsAt,
            endsAt: meetings.endsAt,
            provider: meetings.provider,
            recordingUrl: meetings.recordingUrl,
          })
          .from(meetings)
          .where(inArray(meetings.id, bothIds))
          .orderBy(desc(meetings.startsAt), desc(meetings.createdAt))
          .limit(100)
      : []

    // Open tasks either of us is assigned to, scoped to this workspace and to
    // what the caller is allowed to see: the container rule as well as the
    // private-item rule. Only the second applied, so a DM's Tasks tab listed
    // the colleague's task in a private space the caller is refused (measured,
    // `found-23-sep/workspace-reads-skip-the-container-rule`).
    const isManager = await resolveIsManager(this.db, workspaceId, userId)
    const visible = and(containerVisibilityFilter(this.db, userId, isManager), taskVisibilityFilter(this.db, userId, isManager))
    const sharedTasks = await this.db
      .selectDistinctOn([tasks.id], {
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        listId: tasks.listId,
        assigneeId: taskAssignees.userId,
      })
      .from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, false),
          // Still open — the tab answers "what are we both on?", and everything
          // we ever finished together is a different, much longer question.
          ne(tasks.statusCategory, 'closed'),
          inArray(taskAssignees.userId, [userId, otherUserId]),
          visible,
        ),
      )
      .limit(100)

    return { meetings: sharedMeetings, tasks: sharedTasks }
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
    /*
     * WHERE THE TASKS WILL GO, CHECKED FIRST — before any model is asked, so a
     * refusal costs nothing and reads the same with or without one.
     *
     * `createIn` came from the body and went straight to `createTask`, which
     * asks only whether the caller is a GUEST of the list's workspace. Measured:
     * a member refused a private space made tasks in its list this way, and a
     * user of another organisation aimed their own meeting at this workspace's
     * list and was stopped only by the task type not matching. The list must be
     * in this meeting's workspace and one the caller may open (the rule
     * `ResourceMemberGuard` applies to `POST /tasks`), and a guest makes none.
     */
    if (opts.createIn) await this.assertCanMakeTasksIn(workspaceId, opts.createIn, userId)
    const source = (meeting.notes ?? '').trim() || (meeting.transcript ?? '').trim()
    if (!source) throw new BadRequestException('This meeting has no notes or transcript to read')
    if (!this.ai.isAvailable()) throw new BadRequestException('AI features are not configured')

    const extracted = await this.ai.extractTasksFromNotes(source, { userId, workspaceId })
    const items: Array<{ title: string; description?: string }> = Array.isArray(extracted)
      ? extracted
      : ((extracted as { tasks?: unknown[] })?.tasks as Array<{ title: string; description?: string }>) ?? []

    if (!opts.createIn) return { items, created: [] as Array<{ id: string; title: string }> }

    // Creating them is what turns a summary into work someone will see.
    // Every one carries where it came from — appended rather than used as a
    // fallback, or an item the AI described loses the link to the call and
    // "which meeting was this from?" stops having an answer.
    const origin = `From meeting: ${meeting.title}`
    /*
     * §V2-04 — and say it on the task itself, not only in its description.
     *
     * `[03:26]` names MEETING NOTE as a task type: the type is where a task
     * came from. The line appended above is prose a person has to read; this is
     * what the type filter and the list badge can see.
     *
     * Resolved once rather than per item — the type cannot change mid-loop, and
     * a meeting can yield a dozen action items.
     */
    const meetingTypeId = await taskTypeIdForOrigin(this.db, workspaceId, 'meeting')
    const created: Array<{ id: string; title: string }> = []
    for (const item of items) {
      const title = (item?.title ?? '').trim()
      if (!title) continue
      const described = (item.description ?? '').trim()
      const task = await this.tasksService.createTask({
        listId: opts.createIn,
        title,
        description: described ? `${described}\n\n${origin}` : origin,
        createdById: userId,
        taskTypeId: meetingTypeId,
      })
      // createTask can return null when the list rejects the write; skip
      // rather than reporting a task that was never made.
      if (task?.id) created.push({ id: task.id, title: task.title })
    }
    return { items, created }
  }
}
