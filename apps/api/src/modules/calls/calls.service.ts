import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import {
  callParticipants,
  calls,
  chatChannelMembers,
  chatChannels,
  users,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { MeetingsService } from '../meetings/meetings.service'

/**
 * §2.8 SyncUp — the call itself.
 *
 * Media never touches the server: peers connect directly and the gateway only
 * relays the handshake. What lives here is the part that must be true for
 * everyone at once — who is in the call, whether it is being recorded, and
 * what record it leaves behind.
 */
@Injectable()
export class CallsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private meetings: MeetingsService,
  ) {}

  private async assertMember(workspaceId: string, userId: string) {
    const [m] = await this.db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      )
      .limit(1)
    if (!m) throw new ForbiddenException('Not a member of this workspace')
  }

  /**
   * A call in a channel is reachable by that channel's members, not by the
   * workspace at large — otherwise starting one in a private channel would
   * ring everybody.
   */
  private async assertCanReach(callId: string, userId: string) {
    const [row] = await this.db.select().from(calls).where(eq(calls.id, callId)).limit(1)
    if (!row) throw new NotFoundException('Call not found')
    await this.assertMember(row.workspaceId, userId)
    if (row.channelId) {
      const [member] = await this.db
        .select({ id: chatChannelMembers.id })
        .from(chatChannelMembers)
        .where(
          and(
            eq(chatChannelMembers.channelId, row.channelId),
            eq(chatChannelMembers.userId, userId),
          ),
        )
        .limit(1)
      if (!member) throw new NotFoundException('Call not found')
    }
    return row
  }

  /** The live call in a channel, if there is one. */
  async liveInChannel(channelId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(calls)
      .where(and(eq(calls.channelId, channelId), isNull(calls.endedAt)))
      .orderBy(desc(calls.startedAt))
      .limit(1)
    if (!row) return null
    await this.assertCanReach(row.id, userId)
    return { ...row, participants: await this.participantsOf(row.id) }
  }

  async participantsOf(callId: string) {
    return this.db
      .select({
        userId: callParticipants.userId,
        joinedAt: callParticipants.joinedAt,
        leftAt: callParticipants.leftAt,
        wasRecorded: callParticipants.wasRecorded,
        name: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(callParticipants)
      .innerJoin(users, eq(users.id, callParticipants.userId))
      .where(eq(callParticipants.callId, callId))
      .orderBy(callParticipants.joinedAt)
  }

  /**
   * Start a call, or join the one already running.
   *
   * Two people pressing the button at the same moment must land in the SAME
   * call — starting two and letting them wonder why they cannot see each other
   * is the obvious failure and the hardest one to report.
   */
  async start(
    workspaceId: string,
    userId: string,
    input: { channelId?: string; title?: string },
  ) {
    await this.assertMember(workspaceId, userId)

    if (input.channelId) {
      const [channel] = await this.db
        .select()
        .from(chatChannels)
        .where(eq(chatChannels.id, input.channelId))
        .limit(1)
      if (!channel || channel.workspaceId !== workspaceId) {
        throw new NotFoundException('Channel not found')
      }
      const existing = await this.db
        .select()
        .from(calls)
        .where(and(eq(calls.channelId, input.channelId), isNull(calls.endedAt)))
        .orderBy(desc(calls.startedAt))
        .limit(1)
      if (existing[0]) return this.join(existing[0].id, userId)
    }

    const [row] = await this.db
      .insert(calls)
      .values({
        workspaceId,
        channelId: input.channelId ?? null,
        startedById: userId,
        title: input.title?.trim() || null,
      })
      .returning()

    await this.db
      .insert(callParticipants)
      .values({ callId: row.id, userId })
      .onConflictDoNothing()

    this.realtime.emitToWorkspace(workspaceId, {
      type: 'call.started',
      workspaceId,
      callId: row.id,
      channelId: row.channelId,
      startedById: userId,
    } as never)

    return { ...row, participants: await this.participantsOf(row.id) }
  }

  async join(callId: string, userId: string) {
    const call = await this.assertCanReach(callId, userId)
    if (call.endedAt) throw new BadRequestException('That call has ended')

    await this.db
      .insert(callParticipants)
      .values({
        callId,
        userId,
        // Joining a call that is ALREADY recording marks you recorded from the
        // moment you arrive. Anything else would leave someone who joined
        // mid-recording believing they were not on the tape.
        wasRecorded: call.recording,
      })
      .onConflictDoUpdate({
        target: [callParticipants.callId, callParticipants.userId],
        // Rejoining clears the departure rather than adding a second row.
        set: { leftAt: null, wasRecorded: sql`${callParticipants.wasRecorded} or ${call.recording}` },
      })

    this.realtime.emitToWorkspace(call.workspaceId, {
      type: 'call.participant.joined',
      workspaceId: call.workspaceId,
      callId,
      userId,
    } as never)

    return { ...call, participants: await this.participantsOf(callId) }
  }

  async leave(callId: string, userId: string) {
    const call = await this.assertCanReach(callId, userId)
    await this.db
      .update(callParticipants)
      .set({ leftAt: new Date() })
      .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, userId)))

    this.realtime.emitToWorkspace(call.workspaceId, {
      type: 'call.participant.left',
      workspaceId: call.workspaceId,
      callId,
      userId,
    } as never)

    // The last person out ends the call, so a call nobody is in does not stay
    // "live" forever and keep offering a Join button that leads to an empty room.
    const [{ remaining }] = await this.db
      .select({ remaining: sql<number>`count(*) filter (where ${callParticipants.leftAt} is null)::int` })
      .from(callParticipants)
      .where(eq(callParticipants.callId, callId))
    if (remaining === 0 && !call.endedAt) return this.end(callId, userId)

    return { ok: true, remaining }
  }

  /**
   * End the call and leave a meeting record behind.
   *
   * The record is what makes a call findable a week later, so it is written
   * here rather than left to the client: a browser that is closed as the call
   * ends must not take the record with it.
   */
  async end(callId: string, userId: string) {
    const call = await this.assertCanReach(callId, userId)
    if (call.endedAt) return { ok: true, meetingId: call.meetingId }

    const endedAt = new Date()
    const people = await this.participantsOf(callId)

    const meeting = await this.meetings
      .create(call.workspaceId, userId, {
        title: call.title?.trim() || `Call in ${new Date(call.startedAt).toLocaleDateString()}`,
        startsAt: call.startedAt.toISOString(),
        endsAt: endedAt.toISOString(),
        provider: 'manual',
        attendeeIds: people.map((p) => p.userId),
      })
      .catch(() => null)

    await this.db
      .update(calls)
      .set({ endedAt, meetingId: meeting?.id ?? null })
      .where(eq(calls.id, callId))

    this.realtime.emitToWorkspace(call.workspaceId, {
      type: 'call.ended',
      workspaceId: call.workspaceId,
      callId,
      meetingId: meeting?.id ?? null,
    } as never)

    return { ok: true, meetingId: meeting?.id ?? null }
  }

  /**
   * §2.8 gap 10 — turn recording on or off.
   *
   * Consent is enforced HERE, not in the UI. The flag flips and an event goes
   * to everyone in the call in the same breath, so there is no state in which
   * recording is on and somebody has not been told. Every person currently in
   * the call is marked as recorded at the moment it starts, so the question
   * "was I on that recording" has an answer that does not depend on reading
   * timestamps back.
   */
  async setRecording(callId: string, userId: string, recording: boolean) {
    const call = await this.assertCanReach(callId, userId)
    if (call.endedAt) throw new BadRequestException('That call has ended')
    if (call.recording === recording) return { ok: true, recording }

    const now = new Date()
    await this.db
      .update(calls)
      .set({
        recording,
        recordingStartedAt: recording ? now : call.recordingStartedAt,
      })
      .where(eq(calls.id, callId))

    if (recording) {
      await this.db
        .update(callParticipants)
        .set({ wasRecorded: true })
        .where(and(eq(callParticipants.callId, callId), isNull(callParticipants.leftAt)))
    }

    this.realtime.emitToWorkspace(call.workspaceId, {
      type: 'call.recording',
      workspaceId: call.workspaceId,
      callId,
      recording,
      byUserId: userId,
    } as never)

    return { ok: true, recording }
  }
}
