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
  callTranscriptLines,
  calls,
  chatChannelMembers,
  chatChannels,
  chatMessages,
  meetings,
  users,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { MeetingsService } from '../meetings/meetings.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AiService } from '../ai/ai.service'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import { FLAGS } from '@rundesk/feature-flags'
import { R2Service } from '../../common/storage/r2.service'

/**
 * §2.8 gap 10 — one utterance, capped.
 *
 * Speech recognition emits a phrase at a time; anything approaching this length
 * is a client sending something that is not a transcript.
 */
const MAX_TRANSCRIPT_LINE = 2000

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
    private notifications: NotificationsService,
    private ai: AiService,
    private r2: R2Service,
    private flags: FeatureFlagsService,
  ) {}

  private async assertMember(workspaceId: string, userId: string) {
    const [m] = await this.db
      .select({ id: workspaceMembers.id, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      )
      .limit(1)
    if (!m) throw new ForbiddenException('Not a member of this workspace')
    return m
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

    // §2.8 gap 9 — tell the channel. Best-effort: a call that starts is worth
    // more than an announcement that succeeds, so a failure here must not stop
    // somebody getting into their own call.
    if (row.channelId) {
      await this.announce(row.id, row.channelId, workspaceId, userId).catch(() => {})
    }

    return { ...row, participants: await this.participantsOf(row.id) }
  }

  /**
   * §2.8 gap 9 — a call nobody is told about is a call nobody joins.
   *
   *   `[19:25]` "aap ko notification aa raha hoga ke CALL ka option aaya… aap
   *   chaho to wahan se direct call join ho jaoge"
   *
   * Two things, because they answer two different questions. The card in the
   * channel is for the person who scrolls back an hour later and wants to know
   * what happened; the notification is for the person who is not looking at
   * this channel at all, which is everybody, most of the time.
   */
  private async announce(
    callId: string,
    channelId: string,
    workspaceId: string,
    starterId: string,
  ) {
    const [starter] = await this.db
      .select({ name: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, starterId))
      .limit(1)
    const who = starter?.name?.trim() || starter?.email || 'Someone'

    // The card. `body` carries the same sentence in plain words, so a client
    // that does not know about call cards — an email digest, a search result —
    // still reads as something rather than as an empty message.
    const [message] = await this.db
      .insert(chatMessages)
      .values({ channelId, authorId: starterId, callId, body: `${who} started a SyncUp` })
      .returning()

    this.realtime.emitToWorkspace(workspaceId, {
      type: 'chat.message.created',
      workspaceId,
      channelId,
      message: { ...message, authorName: who, reactions: [] },
    } as never)

    /*
     * The notification, to the channel's members — not the workspace's. Being
     * told about a call in a channel you are not in is noise, and the members
     * table is what "in" means.
     *
     * And only those who have not muted it. Chat already honours
     * notificationLevel for every message; a call ignoring it meant somebody
     * who had deliberately silenced a channel still got rung — and got a web
     * push — which is a louder version of exactly what they asked not to have.
     * 'mentions' is a no as well: a call starting is channel activity, not
     * somebody saying your name.
     */
    const members = await this.db
      .select({ userId: chatChannelMembers.userId, level: chatChannelMembers.notificationLevel })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.channelId, channelId))

    const [channel] = await this.db
      .select({ name: chatChannels.name })
      .from(chatChannels)
      .where(eq(chatChannels.id, channelId))
      .limit(1)

    for (const member of members) {
      if (member.userId === starterId) continue
      if (member.level !== 'all') continue
      await this.notifications
        .create({
          userId: member.userId,
          workspaceId,
          actorId: starterId,
          type: 'call_started',
          title: `${who} started a call`,
          body: channel?.name ? `In #${channel.name}` : undefined,
          // Straight to the channel, where the Join button is. A notification
          // you have to go looking from is not the "direct join" she describes.
          target: {
            entityType: 'call',
            entityId: callId,
            url: `/app/${workspaceId}/chat?channel=${channelId}`,
          },
        })
        .catch(() => null)
    }
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

    // §2.8 gap 10 — "yeh aap ke khud hi NOTES bana ke dega aur poori ki poori
    // RECORDING bhi karega". Both are gathered before the meeting is written,
    // so the record arrives complete rather than being filled in afterwards by
    // a second write that might not happen.
    const transcript = await this.transcriptFor(callId).catch(() => '')
    const notes = transcript ? await this.notesFrom(transcript, call.workspaceId, userId) : null
    // The KEY, not a signed URL. A signed R2 URL lasts fifteen minutes, so
    // writing one into a permanent column produces a recording link that is
    // dead before anybody opens the notes. Meetings signs it on the way out.
    const recordingUrl = call.recordingStorageKey ?? null

    const meeting = await this.meetings
      .create(call.workspaceId, userId, {
        title: call.title?.trim() || `Call in ${new Date(call.startedAt).toLocaleDateString()}`,
        startsAt: call.startedAt.toISOString(),
        endsAt: endedAt.toISOString(),
        provider: 'manual',
        attendeeIds: people.map((p) => p.userId),
        notes,
        recordingUrl,
      })
      .catch(() => null)

    // The transcript itself is written straight onto the record rather than
    // passed through create(): it is not something a person types, and
    // meetings.create's shape is the one a person fills in.
    if (meeting?.id && transcript) {
      await this.db
        .update(meetings)
        .set({ transcript })
        .where(eq(meetings.id, meeting.id))
        .catch(() => undefined)
    }

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

    /*
     * §2.8 gap 11 — the entitlement, enforced HERE and not only in the browser.
     *
     * The "Unlock AI Notetaker" gate lived entirely in the UI, which means it
     * was a suggestion: anything holding a token could turn recording on in a
     * workspace that had switched AI Notes off, and the workspace would record
     * calls and be billed for notes it had declined. A gate that only the
     * honest client respects is not a gate.
     *
     * Only on the way ON. Stopping a recording must never be refused — a
     * workspace that disables the feature mid-call has to be able to stop the
     * one already running.
     */
    if (recording) {
      const member = await this.assertMember(call.workspaceId, userId)
      const allowed = await this.flags.isEnabled(FLAGS.AI_MEETING_NOTES, {
        userId,
        workspaceId: call.workspaceId,
        role: member.role,
      })
      if (!allowed) {
        throw new ForbiddenException('AI Notes is turned off for this workspace')
      }
    }

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

  /**
   * §2.8 gap 10 — one line of what somebody said.
   *
   * Each participant's own browser transcribes their own microphone, which is
   * why the speaker is known rather than guessed: a mixed audio track gives one
   * stream of words with nobody's name on it, and "somebody said they would
   * send the deck" is not a note worth having.
   *
   * Refused unless recording is ON. That is the whole consent story: the banner
   * everyone can see is what makes it lawful to keep any of this, so nothing is
   * kept while the banner is down. A client that keeps talking after recording
   * stops gets a quiet no, not a silent yes.
   */
  async appendTranscript(
    callId: string,
    userId: string,
    text: string,
    replacesPrevious = false,
  ) {
    const call = await this.assertCanReach(callId, userId)
    if (call.endedAt) return { ok: false as const, reason: 'ended' as const }
    if (!call.recording) return { ok: false as const, reason: 'not_recording' as const }

    const line = text.trim().slice(0, MAX_TRANSCRIPT_LINE)
    if (!line) return { ok: false as const, reason: 'empty' as const }

    /*
     * Speech recognition revises itself: "we should ship" becomes "we should
     * ship on Friday" as a second final result. The browser knows which of
     * those is a revision and was already replacing it on screen — but posted
     * both, so the stored transcript kept the half-sentence AND the whole one.
     * The notes are written from that, and a model reading both faithfully
     * reports two commitments where somebody made one.
     *
     * Scoped to THIS speaker's last line. Replacing the most recent line
     * outright would let one person's correction overwrite whatever somebody
     * else said in between.
     */
    if (replacesPrevious) {
      const [previous] = await this.db
        .select({ id: callTranscriptLines.id })
        .from(callTranscriptLines)
        .where(and(eq(callTranscriptLines.callId, callId), eq(callTranscriptLines.userId, userId)))
        .orderBy(desc(callTranscriptLines.saidAt))
        .limit(1)
      if (previous) {
        await this.db
          .update(callTranscriptLines)
          .set({ text: line })
          .where(eq(callTranscriptLines.id, previous.id))
        return { ok: true as const }
      }
    }

    await this.db.insert(callTranscriptLines).values({ callId, userId, text: line })
    return { ok: true as const }
  }

  /**
   * The whole call, as words, attributed and in order.
   *
   * Names are resolved here rather than stored on each line: people rename
   * themselves, and a transcript that says who someone WAS in March is a
   * transcript nobody can search in June.
   */
  async transcriptFor(callId: string): Promise<string> {
    const lines = await this.db
      .select({
        text: callTranscriptLines.text,
        saidAt: callTranscriptLines.saidAt,
        name: users.displayName,
        email: users.email,
      })
      .from(callTranscriptLines)
      .innerJoin(users, eq(users.id, callTranscriptLines.userId))
      .where(eq(callTranscriptLines.callId, callId))
      .orderBy(callTranscriptLines.saidAt)
    if (lines.length === 0) return ''
    return lines
      .map((l) => `${l.name?.trim() || l.email || 'Someone'}: ${l.text}`)
      .join('\n')
  }

  /**
   * What the caller may read back while the call is still running.
   *
   * Being in the CHANNEL is not enough. The consent story is that everyone in
   * the call is told it is being recorded — and somebody sitting in the channel
   * who never joined was never told anything, yet could read verbatim what was
   * being said, live. That is eavesdropping with extra steps.
   *
   * Having LEFT is fine: they were there, they saw the banner, and the words
   * are as much theirs as anyone's.
   */
  async liveTranscript(callId: string, userId: string) {
    await this.assertCanReach(callId, userId)
    const [wasThere] = await this.db
      .select({ id: callParticipants.id })
      .from(callParticipants)
      .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, userId)))
      .limit(1)
    if (!wasThere) {
      throw new ForbiddenException('Only people who were in the call can read what was said')
    }
    return { transcript: await this.transcriptFor(callId) }
  }

  /**
   * Turn the transcript into notes.
   *
   * Returns null rather than throwing when no model is configured: a call that
   * ends must leave its record, its attendees and its recording behind whether
   * or not the AI half of this is available on the instance. A meeting with a
   * transcript and no notes is still a meeting; a call that refused to end
   * because a model was missing is a disaster.
   */
  private async notesFrom(
    transcript: string,
    workspaceId: string,
    userId: string,
  ): Promise<string | null> {
    if (!this.ai.isAvailable()) return null
    return this.ai.notesFromTranscript(transcript, { userId, workspaceId }).catch(() => null)
  }

  /**
   * §2.8 gap 10 — where to PUT the recording.
   *
   * The media never passes through the server during the call, and it does not
   * start to now: the browser uploads the file straight to storage with a
   * pre-signed URL, and only the key comes back here.
   */
  async recordingUploadUrl(callId: string, userId: string, contentType: string) {
    const call = await this.assertCanReach(callId, userId)
    /*
     * "Has this call ever been recorded", not "is it recording right now".
     *
     * The browser cannot upload until MediaRecorder has stopped, and the only
     * thing that stops it is recording being switched off — so by the time the
     * upload asks for a URL, `recording` is ALWAYS false. Requiring it here
     * meant every recording was refused at the last step and silently thrown
     * away, which is the worst possible way for this to fail: the banner was
     * up, everyone consented, and the file went nowhere.
     *
     * `recordingStartedAt` is the honest gate. It is set when recording starts
     * and never cleared, so it says "this call produced a recording, and you
     * may hand it in" — which is exactly the permission being asked for.
     */
    if (!call.recordingStartedAt) throw new BadRequestException('This call was never recorded')
    if (!this.r2.configured) throw new BadRequestException('Storage is not configured')
    const type = contentType || 'audio/webm'
    if (!type.startsWith('audio/') && !type.startsWith('video/')) {
      throw new BadRequestException('A recording must be audio or video')
    }
    const key = `calls/${call.workspaceId}/${callId}/recording-${Date.now()}.webm`
    const uploadUrl = await this.r2.presignPutObject(key, type, { uploadedby: userId })
    return { uploadUrl, storageKey: key }
  }

  /** The upload finished — remember where it landed. */
  async attachRecording(callId: string, userId: string, storageKey: string) {
    const call = await this.assertCanReach(callId, userId)
    if (!storageKey?.startsWith(`calls/${call.workspaceId}/${callId}/`)) {
      // A key from another call would attach somebody else's recording to this
      // meeting, which is the one mistake here that cannot be undone.
      throw new BadRequestException('That storage key does not belong to this call')
    }
    await this.db.update(calls).set({ recordingStorageKey: storageKey }).where(eq(calls.id, callId))

    /*
     * If the call has already ended, backfill the record it left behind.
     *
     * The upload only starts once the recorder stops, so it routinely lands
     * AFTER end() has written the meeting — especially when somebody hangs up
     * for everyone, which ends the call in the same moment it stops the
     * recorder. Without this the file sits in storage with nothing pointing at
     * it, and the meeting says there was no recording.
     */
    if (call.meetingId) {
      await this.db
        .update(meetings)
        .set({ recordingUrl: storageKey })
        .where(eq(meetings.id, call.meetingId))
        .catch(() => undefined)
    }
    return { ok: true }
  }
}
