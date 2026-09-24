import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { eq, and, desc, asc, isNull, isNotNull, or, ne, gt, lt, sql, inArray, ilike } from 'drizzle-orm'
import {
  chatChannels,
  chatChannelMembers,
  chatChannelGroups,
  chatChannelGroupItems,
  chatMessages,
  chatMessageAttachments,
  chatMessageReactions,
  chatMessageEdits,
  chatMessageSaves,
  // §G11/§G12 — assigning a message, and muting or following one thread.
  chatMessageAssignments,
  chatThreadFollows,
  chatCustomEmoji,
  workspaceMembers,
  spaces,
  spaceMembers,
  projects,
  lists,
  users,
  objectShares,
  workspaceGroups,
  workspaceGroupMembers,
  // §2.8 gap 9 — a message can be a call card, and a card renders live state.
  calls,
  callParticipants,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { R2Service } from '../../common/storage/r2.service'
import { safeFileName } from '../../common/storage/file-name'
import { channelReachesGuest, channelReaders, readableChannelsFilter } from './channel-read-filter'
import { isKeyDirectlyUnder } from '../../common/storage/object-key-shape'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { NotificationsService } from '../notifications/notifications.service'
import { TasksService } from '../tasks/tasks.service'
import { TaskRemindersService } from '../reminders/task-reminders.service'
import { PresenceService } from '../presence/presence.service'
import { AiService } from '../ai/ai.service'
import { SharesService, type ShareLevel } from '../shares/shares.service'
import { SkillsService } from '../skills/skills.service'
import { isReservedSlug, resolveSlug } from '../skills/skill-slug'
import { fetchLinkPreview, type UnfurlResult } from './link-unfurl'

const AI_USER_EMAIL = 'ai-assistant@rundesk.system'

/** Link-preview cache tuning (Plan §6.3). Short TTL so previews stay fresh but
 *  repeated views of the same link don't refetch. */
const UNFURL_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const UNFURL_CACHE_MAX_ENTRIES = 500

/** Hard cap on a single chat attachment (Plan §6.8) — mirrors task attachments. */
export const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024 // 100 MB

/** Hard cap on an uploaded custom-emoji image (§A3.8) — emoji render at ~20px. */
export const MAX_CUSTOM_EMOJI_BYTES = 512 * 1024 // 512 KB

/** Max members in a group DM incl. the creator (Plan §6.2). */
export const MAX_GROUP_DM_MEMBERS = 8

/**
 * Per-message delivery status for the author (Plan §6.2). Given a message's
 * createdAt and the read/delivery receipts of the *other* channel members,
 * a message is "seen" once any other member has read it (lastReadAt >=
 * createdAt), else "delivered" once any other member's client acknowledged it
 * (lastDeliveredAt >= createdAt), else just "sent". Seen supersedes Delivered.
 */
export type MessageDeliveryStatus = 'sent' | 'delivered' | 'seen'
export function computeDeliveryStatus(
  createdAt: Date,
  otherMembers: Array<{ lastReadAt: Date | null; lastDeliveredAt: Date | null }>,
): MessageDeliveryStatus {
  const at = createdAt.getTime()
  let delivered = false
  for (const m of otherMembers) {
    if (m.lastReadAt && m.lastReadAt.getTime() >= at) return 'seen'
    if (m.lastDeliveredAt && m.lastDeliveredAt.getTime() >= at) delivered = true
  }
  return delivered ? 'delivered' : 'sent'
}

/** Normalize user-supplied bookmark tags (Plan §6.7): trim, lowercase, dedupe,
 *  drop empties, cap count + length so the Saved panel stays tidy. */
export function normalizeSaveTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const cleaned = tags
    .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
    .filter((t) => t.length > 0 && t.length <= 32)
  return [...new Set(cleaned)].slice(0, 20)
}

/**
 * §2.8 gap 9 — the live state a call card renders from.
 *
 * Sent alongside the message rather than fetched per card: a channel can hold
 * a dozen of these, and a dozen requests to draw a scrollback is not a design.
 */
interface ChatCallCard {
  id: string
  startedAt: string
  endedAt: string | null
  recording: boolean
  startedById: string
  /** Everyone who was ever in it — "1 person joined". */
  joinedCount: number
  /** Everyone still in it. */
  presentCount: number
  /** Whether the person reading this is one of them. */
  youArePresent: boolean
}

@Injectable()
export class ChatService {
  private aiUserId: string | null = null
  /** In-memory unfurl cache (Plan §6.3): url → { fetchedAt, metadata }. */
  private unfurlCache = new Map<string, { at: number; value: UnfurlResult }>()

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
    private tasks: TasksService,
    private ai: AiService,
    private r2: R2Service,
    private reminders: TaskRemindersService,
    private presence: PresenceService,
    private shares: SharesService,
    private skills: SkillsService,
  ) {}

  /**
   * §6.8 — enforce the declared attachment size on the presign/record paths.
   * A valid, positive `sizeBytes` is mandatory (reject missing/≤0/over cap). The
   * declared-size gate is authoritative because R2 presigned PUT URLs cannot
   * bound the actual uploaded bytes (see R2Service.presignPutObject).
   */
  private assertAttachmentSize(sizeBytes?: number): void {
    if (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('A valid attachment sizeBytes is required')
    }
    if (sizeBytes > MAX_CHAT_ATTACHMENT_BYTES) {
      const mb = Math.round(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024))
      throw new BadRequestException(`Attachment exceeds the ${mb} MB limit`)
    }
  }

  /**
   * Presign a direct-to-R2 upload for a chat attachment (Plan §6.8). The caller
   * PUTs the bytes to `uploadUrl`, then calls recordAttachment with the returned
   * storageKey. Membership is enforced up-front via assertChannelAccess.
   */
  async createAttachmentUploadUrl(
    channelId: string,
    userId: string,
    body: { fileName: string; contentType: string; sizeBytes?: number },
  ) {
    this.assertCanPost(await this.assertChannelAccess(channelId, userId))
    if (!this.r2.configured) throw new BadRequestException('R2 storage is not configured')
    this.assertAttachmentSize(body.sizeBytes)
    const fileName = safeFileName(body.fileName)
    const key = `chat/${channelId}/attachments/${Date.now()}-${fileName}`
    const uploadUrl = await this.r2.presignPutObject(key, body.contentType || 'application/octet-stream', {
      uploadedby: userId,
      channelid: channelId,
    })
    return { uploadUrl, storageKey: key }
  }

  /**
   * Record an uploaded attachment (message_id null until the message is posted).
   * Returns the row plus a short-lived download URL so the composer can preview it.
   */
  async recordAttachment(
    channelId: string,
    userId: string,
    data: { fileName: string; contentType: string; sizeBytes: number; storageKey: string },
  ) {
    this.assertCanPost(await this.assertChannelAccess(channelId, userId))
    this.assertAttachmentSize(data.sizeBytes)
    if (!data.storageKey) throw new BadRequestException('storageKey is required')
    // Exactly the key the presign above mints for THIS channel. This took any
    // key and signed it straight back — a working URL to any object in the
    // bucket for anybody who can post here. See object-key-shape.ts for why
    // the check is the shape and not a prefix.
    if (!isKeyDirectlyUnder(data.storageKey, `chat/${channelId}/attachments/`)) {
      throw new BadRequestException('storageKey must be an upload presigned for this channel')
    }
    const [row] = await this.db
      .insert(chatMessageAttachments)
      .values({
        channelId,
        fileName: safeFileName(data.fileName),
        contentType: data.contentType || 'application/octet-stream',
        sizeBytes: Math.max(0, Math.floor(data.sizeBytes || 0)),
        storageKey: data.storageKey,
        uploadedById: userId,
      })
      .returning()
    return {
      id: row.id,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      storageKey: row.storageKey,
      url: await this.chatAttachmentUrl(row),
    }
  }

  /**
   * The URL a chat attachment is fetched from — one rule for the four places a
   * row becomes a link, which were four copies of one ternary. Signed only when
   * the key is exactly its own channel's upload; a key that got into the table
   * before `recordAttachment` checked, or by any path added later, becomes no
   * link at all rather than a signed URL to somebody else's object.
   */
  private async chatAttachmentUrl(a: { channelId: string; storageKey: string }): Promise<string | null> {
    if (!isKeyDirectlyUnder(a.storageKey, `chat/${a.channelId}/attachments/`)) return null
    return this.r2.configured ? this.r2.getObjectUrl(a.storageKey) : a.storageKey
  }

  /** Ensure a system "Rundesk AI" user exists to author @Rundesk replies. */
  private async ensureAiUser(): Promise<string> {
    if (this.aiUserId) return this.aiUserId
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, AI_USER_EMAIL)).limit(1)
    if (existing) {
      this.aiUserId = existing.id
      return existing.id
    }
    const [created] = await this.db
      .insert(users)
      .values({ email: AI_USER_EMAIL, displayName: 'Rundesk AI', emailVerified: true } as any)
      .onConflictDoNothing()
      .returning({ id: users.id })
    if (created) {
      this.aiUserId = created.id
      return created.id
    }
    const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, AI_USER_EMAIL)).limit(1)
    this.aiUserId = row.id
    return row.id
  }

  /** If a message mentions @Rundesk, generate + post an AI reply (§7.6). */
  private async maybeAnswerAiMention(
    channel: { id: string; workspaceId: string; spaceId: string | null; isPrivate: boolean; isDm: boolean },
    authorId: string,
    body: string,
  ) {
    if (!/@rundesk\b/i.test(body) || !this.ai.isAvailable()) return
    try {
      const aiUserId = await this.ensureAiUser()
      // Make sure the AI is a member so its message passes access checks.
      await this.db
        .insert(chatChannelMembers)
        .values({ channelId: channel.id, userId: aiUserId })
        .onConflictDoNothing()
      const context = await this.ai.buildWorkspaceContext(channel.workspaceId, authorId)
      const prompt = body.replace(/@rundesk\b/gi, '').trim() || 'Say hello and offer help.'
      const answer = await this.ai.chatReply([{ role: 'user', content: prompt }], context, {
        userId: authorId,
        workspaceId: channel.workspaceId,
      })
      if (!answer) return
      const [aiMsg] = await this.db
        .insert(chatMessages)
        .values({ channelId: channel.id, authorId: aiUserId, body: answer })
        .returning()
      await this.emitToChannel(channel, {
        type: 'chat.message.created',
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        message: { ...aiMsg, authorName: 'Rundesk AI', reactions: [] },
      })
    } catch {
      // AI reply is best-effort; never break the user's message.
    }
  }

  private extractMentionIds(body: string): string[] {
    const ids = new Set<string>()
    const patterns = [
      /<@([0-9a-fA-F-]{36})>/g,
      /@\[([0-9a-fA-F-]{36})\]/g,
    ]
    for (const pattern of patterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.exec(body)) !== null) ids.add(match[1])
    }
    return [...ids]
  }

  /**
   * Detect the broadcast mentions @here / @channel (Plan §6.9). `@channel`
   * targets every channel member; `@here` targets only the currently-present
   * members. Word-boundaried + case-insensitive so "@channel," or "@Here" match
   * but an email like "a@channel.com" does not (the trailing `.` isn't allowed).
   */
  private extractSpecialMentions(body: string): { here: boolean; channel: boolean } {
    return {
      here: /(^|\s)@here\b(?!\.)/i.test(body),
      channel: /(^|\s)@channel\b(?!\.)/i.test(body),
    }
  }

  /**
   * §A4.3 — pull out candidate team handles. Deliberately loose: anything that
   * looks like a handle is collected here and only becomes a mention if a team
   * in this workspace actually answers to it, so `@here` or a stray `@word`
   * costs one lookup and notifies nobody.
   */
  private extractAliasCandidates(body: string): string[] {
    const out = new Set<string>()
    // `<` is excluded so the `<@uuid>` user-mention token is not re-read as a
    // handle, and `/` so an email or URL fragment never is.
    const pattern = /(^|[^\w@/<[])@([a-z0-9][a-z0-9_-]{1,31})\b(?!\.)/gi
    let match: RegExpExecArray | null
    while ((match = pattern.exec(body)) !== null) out.add(match[2].toLowerCase())
    return [...out]
  }

  /**
   * Expand @team handles into the member ids they stand for. A team mention is
   * a shorthand for its people: everyone in the group gets the same mention
   * ping they would have got had they been named individually.
   */
  private async resolveTeamMentionTargets(workspaceId: string, body: string): Promise<Set<string>> {
    const targets = new Set<string>()
    const candidates = this.extractAliasCandidates(body)
    if (candidates.length === 0) return targets
    const rows = await this.db
      .select({ userId: workspaceGroupMembers.userId })
      .from(workspaceGroups)
      .innerJoin(workspaceGroupMembers, eq(workspaceGroupMembers.groupId, workspaceGroups.id))
      .where(
        and(
          eq(workspaceGroups.workspaceId, workspaceId),
          isNotNull(workspaceGroups.alias),
          inArray(sql`lower(${workspaceGroups.alias})`, candidates),
        ),
      )
    for (const row of rows) targets.add(row.userId)
    return targets
  }

  /**
   * Resolve the member ids a @here / @channel broadcast should notify. @channel
   * is every member; @here narrows to members the presence service reports as
   * online, falling back to all members if presence is unavailable or nobody
   * registers as present. Excludes the author.
   */
  private async resolveBroadcastTargets(
    channelId: string,
    authorId: string,
    special: { here: boolean; channel: boolean },
    memberIds: string[],
  ): Promise<Set<string>> {
    const targets = new Set<string>()
    if (!special.here && !special.channel) return targets
    const others = memberIds.filter((id) => id !== authorId)
    if (special.channel) {
      for (const id of others) targets.add(id)
      return targets
    }
    // @here only: narrow to present members via the presence service.
    try {
      const statuses = await this.presence.statusFor(others)
      const present = others.filter((id) => statuses[id] === 'online')
      // If presence has no signal for anyone (e.g. never-seen), treat @here like
      // @channel so the broadcast isn't silently dropped.
      const chosen = present.length > 0 ? present : others
      for (const id of chosen) targets.add(id)
    } catch {
      for (const id of others) targets.add(id)
    }
    return targets
  }

  /** The one channel read rule, per channel; `readableChannelsFilter` is its SQL twin. */
  private async assertChannelAccess(channelId: string, userId: string) {
    const [channel] = await this.db.select().from(chatChannels).where(eq(chatChannels.id, channelId)).limit(1)
    if (!channel) throw new NotFoundException('Channel not found')

    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, channel.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!membership) throw new ForbiddenException('Workspace membership required')

    // A GUEST reads a public channel only through a share of it or a grant on
    // its space (`channelReachesGuest`); a private channel or a DM, by the
    // membership below, which for those is an invitation
    // (`found-24-sep/guests-read-every-open-channel`).
    if (membership.role === 'guest' && !channel.isPrivate && !channel.isDm && !(await channelReachesGuest(this.db, channel, userId))) {
      throw new ForbiddenException('This channel is not shared with you')
    }

    // Space-scoped channels (Plan §6.1): a channel in a PRIVATE space also
    // requires space membership. Public spaces (the default) fall back to plain
    // workspace membership — mirrors the container-access model used elsewhere.
    if (channel.spaceId) {
      const [space] = await this.db
        .select({ visibility: spaces.visibility })
        .from(spaces)
        .where(eq(spaces.id, channel.spaceId))
        .limit(1)
      if (space?.visibility === 'private') {
        const [spaceMembership] = await this.db
          .select({ userId: spaceMembers.userId })
          .from(spaceMembers)
          .where(and(eq(spaceMembers.spaceId, channel.spaceId), eq(spaceMembers.userId, userId)))
          .limit(1)
        if (!spaceMembership) throw new ForbiddenException('Space membership required')
      }
    }

    // Share & Permissions can also let someone into a private channel. Only a
    // grant on the CHANNEL counts — inheriting a space grant here would open
    // every private channel in that space to anyone who can see the space.
    // A DM is never shareable, so a grant can never stand in for membership.
    const sharedLevel: ShareLevel | null = channel.isDm
      ? null
      : await this.shares.directLevel('channel', channelId, userId)

    let isMember = true
    if (channel.isPrivate || channel.isDm) {
      const [channelMembership] = await this.db
        .select({ userId: chatChannelMembers.userId })
        .from(chatChannelMembers)
        .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
        .limit(1)
      if (!channelMembership && !sharedLevel) throw new ForbiddenException('Channel membership required')
      isMember = !!channelMembership
    }

    // The grant wins over membership, deliberately. Opening a channel upserts a
    // member row (markChannelRead), so letting membership win would quietly
    // promote a view-only visitor to full posting rights on their second
    // request. Most-specific-wins keeps the granted level authoritative.
    return { ...channel, accessLevel: sharedLevel ?? ('admin' as ShareLevel), isMember }
  }

  /**
   * A chat event goes to the people who may read its channel, and no further.
   *
   * Every one of these went to the workspace's room, which every member's
   * socket joins. Measured: a member refused a DM, a private channel and a
   * private space's channel (403 on each) heard every message in them as it
   * was written, every edit, and the name of each new private channel
   * (`found-24-sep/chat-events-broadcast-to-the-workspace`). A public
   * channel's events still go to the workspace room; the rest go to each
   * reader's own `user:` room, which every socket joins on connect, so the web
   * hears them as before (it already drops events of another workspace).
   *
   * Membership events (`chat.channel.members.*`) stay workspace-wide: they
   * carry only the channel's id, and a person just removed must still hear
   * that they were.
   */
  private async emitToChannel(
    channel: { id: string; workspaceId: string; spaceId: string | null; isPrivate: boolean; isDm: boolean },
    event: Parameters<RealtimeGateway['emitToWorkspace']>[1],
  ) {
    const readers = await channelReaders(this.db, channel)
    if (readers.workspace) this.realtime.emitToWorkspace(channel.workspaceId, event)
    for (const userId of readers.users) this.realtime.emitToUser(userId, event)
  }

  /** Read-only visitors (view level) may not write into a channel. */
  private assertCanPost(access: { accessLevel: ShareLevel }) {
    if (access.accessLevel === 'view') {
      throw new ForbiddenException('You have view-only access to this channel')
    }
  }

  /**
   * Someone inside a private channel purely because it was shared with them.
   *
   * They must never acquire a chat_channel_members row: membership outlives the
   * grant, so revoking the share would leave them with access anyway. Their
   * read/delivery markers go untracked, which is a fair trade for revocation
   * that actually revokes.
   */
  private isShareOnlyVisitor(access: { isPrivate: boolean; isMember: boolean }) {
    return access.isPrivate && !access.isMember
  }

  async listChannels(workspaceId: string, userId: string) {
    const rows = await this.db
      .select({
        id: chatChannels.id,
        name: chatChannels.name,
        description: chatChannels.description,
        topic: chatChannels.topic,
        icon: chatChannels.icon,
        spaceId: chatChannels.spaceId,
        isPrivate: chatChannels.isPrivate,
        isDm: chatChannels.isDm,
        createdById: chatChannels.createdById,
        createdAt: chatChannels.createdAt,
      })
      .from(chatChannels)
      /*
       * The channels this user can READ, by the one rule. This filtered in
       * the browser's image of it (`!isPrivate || member || grant`) and left
       * out the private-space half: measured on lane 1, a member not in a
       * private space was listed its channel, by name, though opening it
       * answered 403.
       */
      .where(
        and(
          eq(chatChannels.workspaceId, workspaceId),
          isNull(chatChannels.archivedAt),
          readableChannelsFilter(this.db, userId, workspaceId),
        ),
      )
      .orderBy(asc(chatChannels.createdAt))

    const memberships = await this.db
      .select()
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.userId, userId))

    const memberSet = new Set(memberships.map((m) => m.channelId))
    const lastReadMap = new Map(memberships.map((m) => [m.channelId, m.lastReadAt]))
    const levelMap = new Map(memberships.map((m) => [m.channelId, m.notificationLevel]))

    // Channels shared with this user directly. Without this a private channel
    // granted through Share & Permissions would stay invisible in the sidebar,
    // leaving the grant unreachable.
    const grants = await this.db
      .select({ channelId: objectShares.objectId, level: objectShares.level })
      .from(objectShares)
      .where(and(
        eq(objectShares.objectType, 'channel'),
        eq(objectShares.userId, userId),
        eq(objectShares.workspaceId, workspaceId),
      ))
    const grantMap = new Map(grants.map((g) => [g.channelId, g.level as ShareLevel]))

    // Unread = top-level messages the user didn't author, newer than their
    // last-read marker, across the channels they're a member of.
    const unreadRows = await this.db
      .select({ channelId: chatMessages.channelId, count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .innerJoin(
        chatChannelMembers,
        and(eq(chatChannelMembers.channelId, chatMessages.channelId), eq(chatChannelMembers.userId, userId)),
      )
      .where(
        and(
          ne(chatMessages.authorId, userId),
          isNull(chatMessages.parentMessageId),
          or(isNull(chatChannelMembers.lastReadAt), gt(chatMessages.createdAt, chatChannelMembers.lastReadAt)),
        ),
      )
      .groupBy(chatMessages.channelId)
    const unreadMap = new Map(unreadRows.map((r) => [r.channelId, r.count]))

    // Already only what the user can read (the query's own rule); the grant
    // map still says at what level.
    const visible = rows
      .map((c) => ({
        ...c,
        joined: memberSet.has(c.id),
        unreadCount: unreadMap.get(c.id) ?? 0,
        lastReadAt: lastReadMap.get(c.id) ?? null,
        notificationLevel: levelMap.get(c.id) ?? 'all',
        // Lets the composer go read-only for a view-only visitor.
        accessLevel: grantMap.get(c.id) ?? 'admin',
      }))

    const dmChannels = visible.filter((c) => c.isDm)
    if (dmChannels.length === 0) return visible

    const dmIds = dmChannels.map((c) => c.id)
    const members = await this.db
      .select({
        channelId: chatChannelMembers.channelId,
        userId: chatChannelMembers.userId,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(chatChannelMembers)
      .leftJoin(users, eq(users.id, chatChannelMembers.userId))
      .where(or(...dmIds.map((id) => eq(chatChannelMembers.channelId, id))))

    return visible.map((channel) => {
      if (!channel.isDm) return channel
      // A DM can have >2 members (group DM, Plan §6.2). Label with every other
      // participant; keep the single dmPeer* fields (first peer) for the 1:1 UI.
      const peers = members.filter((m) => m.channelId === channel.id && m.userId !== userId)
      const primary = peers[0]
      const isGroup = peers.length > 1
      return {
        ...channel,
        dmPeerId: primary?.userId,
        dmPeerName: primary?.displayName ?? null,
        dmPeerAvatarUrl: primary?.avatarUrl ?? null,
        dmIsGroup: isGroup,
        dmPeers: peers.map((p) => ({ userId: p.userId, displayName: p.displayName ?? null, avatarUrl: p.avatarUrl ?? null })),
        dmLabel: isGroup ? peers.map((p) => p.displayName ?? 'Member').join(', ') : (primary?.displayName ?? null),
      }
    })
  }

  /** Mark a channel read up to now for the user (upserts their member row). */
  async markChannelRead(channelId: string, userId: string) {
    const access = await this.assertChannelAccess(channelId, userId)
    const now = new Date()
    if (this.isShareOnlyVisitor(access)) return { ok: true, lastReadAt: now }
    await this.db
      .insert(chatChannelMembers)
      .values({ channelId, userId, lastReadAt: now })
      .onConflictDoUpdate({
        target: [chatChannelMembers.channelId, chatChannelMembers.userId],
        set: { lastReadAt: now },
      })
    return { ok: true, lastReadAt: now }
  }

  /** Mark the channel's messages delivered to the caller (Plan §6.2). Mirrors
   *  markChannelRead but only advances the delivery marker — the client calls
   *  this when it receives/opens a channel's messages, so senders can see
   *  "Delivered" before the recipient actually reads. */
  async markChannelDelivered(channelId: string, userId: string) {
    const access = await this.assertChannelAccess(channelId, userId)
    const now = new Date()
    if (this.isShareOnlyVisitor(access)) return { ok: true, lastDeliveredAt: now }
    await this.db
      .insert(chatChannelMembers)
      .values({ channelId, userId, lastDeliveredAt: now })
      .onConflictDoUpdate({
        target: [chatChannelMembers.channelId, chatChannelMembers.userId],
        set: { lastDeliveredAt: now },
      })
    return { ok: true, lastDeliveredAt: now }
  }

  /**
   * Rewind the caller's read cursor so a channel comes back unread (§A3.3).
   * With a messageId the cursor lands 1ms before that message, so the stream's
   * unread divider sits exactly above it; without one it lands before the most
   * recent message someone else wrote, which is what "mark this channel unread"
   * means from the sidebar.
   */
  async markChannelUnread(channelId: string, userId: string, messageId?: string) {
    const access = await this.assertChannelAccess(channelId, userId)
    let anchor: Date | null = null
    if (messageId) {
      const [message] = await this.db
        .select({ createdAt: chatMessages.createdAt, channelId: chatMessages.channelId })
        .from(chatMessages)
        .where(eq(chatMessages.id, messageId))
        .limit(1)
      if (!message || message.channelId !== channelId) throw new NotFoundException('Message not found')
      anchor = message.createdAt
    } else {
      const [latest] = await this.db
        .select({ createdAt: chatMessages.createdAt })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.channelId, channelId),
            isNull(chatMessages.parentMessageId),
            ne(chatMessages.authorId, userId),
          ),
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(1)
      anchor = latest?.createdAt ?? null
    }
    // Nothing to go back to (an empty channel, or only the caller's own
    // messages) — clearing the cursor is the honest answer.
    const lastReadAt = anchor ? new Date(anchor.getTime() - 1) : null
    if (this.isShareOnlyVisitor(access)) return { ok: true, lastReadAt }
    await this.db
      .insert(chatChannelMembers)
      .values({ channelId, userId, lastReadAt })
      .onConflictDoUpdate({
        target: [chatChannelMembers.channelId, chatChannelMembers.userId],
        set: { lastReadAt },
      })
    return { ok: true, lastReadAt }
  }

  /** Set the caller's notification level for a channel ('all' | 'mentions' | 'none'). */
  async setChannelNotificationLevel(channelId: string, userId: string, level: string) {
    if (!['all', 'mentions', 'none'].includes(level)) {
      throw new ForbiddenException("level must be 'all', 'mentions', or 'none'")
    }
    const access = await this.assertChannelAccess(channelId, userId)
    if (this.isShareOnlyVisitor(access)) return { ok: true, notificationLevel: level }
    await this.db
      .insert(chatChannelMembers)
      .values({ channelId, userId, notificationLevel: level as 'all' | 'mentions' | 'none' })
      .onConflictDoUpdate({
        target: [chatChannelMembers.channelId, chatChannelMembers.userId],
        set: { notificationLevel: level as 'all' | 'mentions' | 'none' },
      })
    return { ok: true, level }
  }

  /** Total + per-channel unread counts across the user's channels in a workspace. */
  async unreadSummary(workspaceId: string, userId: string) {
    const rows = await this.db
      .select({ channelId: chatMessages.channelId, count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .innerJoin(
        chatChannelMembers,
        and(eq(chatChannelMembers.channelId, chatMessages.channelId), eq(chatChannelMembers.userId, userId)),
      )
      .where(
        and(
          eq(chatChannels.workspaceId, workspaceId),
          isNull(chatChannels.archivedAt),
          ne(chatMessages.authorId, userId),
          isNull(chatMessages.parentMessageId),
          or(isNull(chatChannelMembers.lastReadAt), gt(chatMessages.createdAt, chatChannelMembers.lastReadAt)),
        ),
      )
      .groupBy(chatMessages.channelId)
    const byChannel: Record<string, number> = {}
    let total = 0
    for (const r of rows) {
      byChannel[r.channelId] = r.count
      total += r.count
    }
    return { total, byChannel }
  }

  async ensureDmChannel(workspaceId: string, currentUserId: string, peerUserId: string) {
    if (currentUserId === peerUserId) throw new ForbiddenException('Cannot create a DM with yourself')

    const [meMembership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, currentUserId)))
      .limit(1)
    const [peerMembership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, peerUserId)))
      .limit(1)
    if (!meMembership || !peerMembership) {
      throw new ForbiddenException('Both users must belong to this workspace')
    }

    const dmChannels = await this.db
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(and(eq(chatChannels.workspaceId, workspaceId), eq(chatChannels.isDm, true), isNull(chatChannels.archivedAt)))

    for (const channel of dmChannels) {
      const members = await this.db
        .select({ userId: chatChannelMembers.userId })
        .from(chatChannelMembers)
        .where(eq(chatChannelMembers.channelId, channel.id))
      const ids = new Set(members.map((m) => m.userId))
      if (ids.size === 2 && ids.has(currentUserId) && ids.has(peerUserId)) return channel
    }

    const [row] = await this.db
      .insert(chatChannels)
      .values({
        workspaceId,
        name: `dm-${currentUserId.slice(0, 8)}-${peerUserId.slice(0, 8)}`,
        isPrivate: true,
        isDm: true,
        createdById: currentUserId,
      })
      .returning()

    await this.db
      .insert(chatChannelMembers)
      .values([
        { channelId: row.id, userId: currentUserId },
        { channelId: row.id, userId: peerUserId },
      ])
      .onConflictDoNothing()

    await this.emitToChannel(row, {
      type: 'chat.channel.created',
      workspaceId,
      channel: row,
    })
    return row
  }

  /**
   * Create (or reuse) a group DM among the current user and 2+ peers (Plan §6.2).
   * A group DM is an isDm channel with 3+ members; dedup is by the exact member
   * set so re-opening the same group returns the existing channel. A single peer
   * falls back to the 1:1 ensureDmChannel path.
   */
  async createGroupDm(workspaceId: string, currentUserId: string, peerUserIds: string[]) {
    const peers = [...new Set((peerUserIds ?? []).filter(Boolean))].filter((id) => id !== currentUserId)
    if (peers.length === 0) throw new BadRequestException('Select at least one other person for a direct message')
    if (peers.length === 1) return this.ensureDmChannel(workspaceId, currentUserId, peers[0])

    // Cap group size incl. the creator (Plan §6.2).
    if (peers.length + 1 > MAX_GROUP_DM_MEMBERS) {
      throw new BadRequestException(`A group direct message can include at most ${MAX_GROUP_DM_MEMBERS} people`)
    }

    // Every participant (creator + peers) must belong to the workspace.
    const participants = [currentUserId, ...peers]
    const wsMembers = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, participants)))
    const validIds = new Set(wsMembers.map((m) => m.userId))
    if (!validIds.has(currentUserId)) throw new ForbiddenException('Workspace membership required')
    if (participants.some((id) => !validIds.has(id))) {
      throw new ForbiddenException('All participants must belong to this workspace')
    }

    // Reuse an existing group DM whose member set is exactly these participants.
    const target = new Set(participants)
    const dmChannels = await this.db
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(and(eq(chatChannels.workspaceId, workspaceId), eq(chatChannels.isDm, true), isNull(chatChannels.archivedAt)))
    for (const channel of dmChannels) {
      const rows = await this.db
        .select({ userId: chatChannelMembers.userId })
        .from(chatChannelMembers)
        .where(eq(chatChannelMembers.channelId, channel.id))
      const ids = new Set(rows.map((r) => r.userId))
      if (ids.size === target.size && [...target].every((id) => ids.has(id))) return channel
    }

    const [row] = await this.db
      .insert(chatChannels)
      .values({
        workspaceId,
        name: `dm-group-${currentUserId.slice(0, 8)}-${target.size}`,
        isPrivate: true,
        isDm: true,
        createdById: currentUserId,
      })
      .returning()

    await this.db
      .insert(chatChannelMembers)
      .values([...target].map((userId) => ({ channelId: row.id, userId })))
      .onConflictDoNothing()

    await this.emitToChannel(row, {
      type: 'chat.channel.created',
      workspaceId,
      channel: row,
    })
    return row
  }

  async createChannel(data: {
    workspaceId: string
    name: string
    description?: string
    icon?: string
    isPrivate?: boolean
    spaceId?: string | null
    createdById: string
    memberIds?: string[]
  }) {
    // A non-string name (missing, number, object) threw on `.trim()` → 500.
    // Validate the type first and return a 400 instead.
    if (typeof data.name !== 'string' || !data.name.trim()) throw new BadRequestException('Channel name required')
    // ClickUp's guests use the channels they are given and make none.
    const [maker] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, data.workspaceId), eq(workspaceMembers.userId, data.createdById)))
      .limit(1)
    if (maker?.role === 'guest') throw new ForbiddenException('Guests cannot create channels')
    const name = data.name.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-')
    if (!name) throw new BadRequestException('Channel name required')
    // Optional space scoping (Plan §6.1): the space must belong to this workspace.
    let spaceId: string | null = null
    if (data.spaceId) {
      const [space] = await this.db
        .select({ id: spaces.id })
        .from(spaces)
        .where(and(eq(spaces.id, data.spaceId), eq(spaces.workspaceId, data.workspaceId)))
        .limit(1)
      if (!space) throw new BadRequestException('Space not found in this workspace')
      spaceId = space.id
    }
    const [row] = await this.db
      .insert(chatChannels)
      .values({
        workspaceId: data.workspaceId,
        name,
        description: data.description,
        icon: data.icon,
        spaceId,
        isPrivate: data.isPrivate ?? false,
        createdById: data.createdById,
      })
      .returning()
    await this.db
      .insert(chatChannelMembers)
      .values({ channelId: row.id, userId: data.createdById })
      .onConflictDoNothing()
    // Seed any invited members (validated against workspace membership).
    if (data.memberIds?.length) {
      await this.addChannelMembers(row.id, data.createdById, data.memberIds)
    }
    await this.emitToChannel(row, {
      type: 'chat.channel.created',
      workspaceId: data.workspaceId,
      channel: row,
    })
    return row
  }

  /**
   * Edit a channel's name / topic / description / icon (Plan §6.1, §A3.7).
   * Moderator-gated (channel creator or workspace admin) via canModerateChannel.
   * DMs aren't editable this way. Only provided fields are changed.
   */
  async updateChannel(
    channelId: string,
    userId: string,
    patch: { name?: string; topic?: string | null; description?: string | null; icon?: string | null },
  ) {
    const channel = await this.assertChannelAccess(channelId, userId)
    if (channel.isDm) throw new BadRequestException('Direct messages cannot be edited')
    if (!(await this.canModerateChannel(channel, userId))) {
      throw new ForbiddenException('Only the channel creator or a workspace admin can edit this channel')
    }
    const set: Partial<{ name: string; topic: string | null; description: string | null; icon: string | null }> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-')
      if (!name) throw new BadRequestException('Channel name required')
      set.name = name
    }
    if (patch.topic !== undefined) set.topic = patch.topic?.trim().slice(0, 250) || null
    if (patch.description !== undefined) set.description = patch.description?.trim() || null
    if (patch.icon !== undefined) set.icon = patch.icon?.trim() || null
    if (Object.keys(set).length === 0) return channel
    const [row] = await this.db
      .update(chatChannels)
      .set(set)
      .where(eq(chatChannels.id, channelId))
      .returning()
    // Reuse chat.channel.created (the client handler just refetches the channel
    // list) so other members pick up the new name / description / icon.
    await this.emitToChannel(row, {
      type: 'chat.channel.created',
      workspaceId: channel.workspaceId,
      channel: row,
    })
    return row
  }

  /**
   * Archive / unarchive a channel (Plan §6.1). Writes archivedAt; archived
   * channels drop out of the normal list. Moderator-gated; DMs excluded.
   */
  async setChannelArchived(channelId: string, userId: string, archived: boolean) {
    const channel = await this.assertChannelAccess(channelId, userId)
    if (channel.isDm) throw new BadRequestException('Direct messages cannot be archived')
    if (!(await this.canModerateChannel(channel, userId))) {
      throw new ForbiddenException('Only the channel creator or a workspace admin can archive this channel')
    }
    const [row] = await this.db
      .update(chatChannels)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(chatChannels.id, channelId))
      .returning()
    await this.emitToChannel(row, {
      type: 'chat.channel.created',
      workspaceId: channel.workspaceId,
      channel: row,
    })
    return row
  }

  /**
   * List a workspace's archived channels (Plan §6.1) so members can review /
   * unarchive them. Mirrors listChannels' visibility: private channels only
   * show to their members. DMs are never archived here, so excluded.
   */
  async listArchivedChannels(workspaceId: string, userId: string) {
    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!membership) throw new ForbiddenException('Workspace membership required')

    const rows = await this.db
      .select({
        id: chatChannels.id,
        name: chatChannels.name,
        description: chatChannels.description,
        icon: chatChannels.icon,
        spaceId: chatChannels.spaceId,
        isPrivate: chatChannels.isPrivate,
        isDm: chatChannels.isDm,
        createdById: chatChannels.createdById,
        archivedAt: chatChannels.archivedAt,
        createdAt: chatChannels.createdAt,
      })
      .from(chatChannels)
      .where(
        and(
          eq(chatChannels.workspaceId, workspaceId),
          isNotNull(chatChannels.archivedAt),
          eq(chatChannels.isDm, false),
        ),
      )
      .orderBy(desc(chatChannels.archivedAt))

    const memberships = await this.db
      .select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.userId, userId))
    const memberSet = new Set(memberships.map((m) => m.channelId))
    return rows
      .filter((c) => !c.isPrivate || memberSet.has(c.id))
      .map((c) => ({ ...c, joined: memberSet.has(c.id) }))
  }

  /**
   * The caller's channel groups for a workspace (§A3.4), each with the channels
   * they've filed into it. Space-derived grouping stays as the fallback in the
   * sidebar for anything that isn't in a group.
   */
  async listChannelGroups(workspaceId: string, userId: string) {
    const groups = await this.db
      .select({
        id: chatChannelGroups.id,
        name: chatChannelGroups.name,
        position: chatChannelGroups.position,
        isCollapsed: chatChannelGroups.isCollapsed,
      })
      .from(chatChannelGroups)
      .where(and(eq(chatChannelGroups.workspaceId, workspaceId), eq(chatChannelGroups.userId, userId)))
      .orderBy(asc(chatChannelGroups.position), asc(chatChannelGroups.createdAt))
    if (groups.length === 0) return []

    const items = await this.db
      .select({ groupId: chatChannelGroupItems.groupId, channelId: chatChannelGroupItems.channelId })
      .from(chatChannelGroupItems)
      .where(inArray(chatChannelGroupItems.groupId, groups.map((g) => g.id)))
      .orderBy(asc(chatChannelGroupItems.position), asc(chatChannelGroupItems.createdAt))

    const byGroup = new Map<string, string[]>()
    for (const item of items) {
      const list = byGroup.get(item.groupId) ?? []
      list.push(item.channelId)
      byGroup.set(item.groupId, list)
    }
    return groups.map((g) => ({ ...g, channelIds: byGroup.get(g.id) ?? [] }))
  }

  private normalizeGroupName(name: string): string {
    const trimmed = (name ?? '').trim().slice(0, 60)
    if (!trimmed) throw new BadRequestException('Group name required')
    return trimmed
  }

  /** The caller's own group, or 404. Groups are private to their owner. */
  private async assertOwnGroup(groupId: string, userId: string) {
    const [group] = await this.db
      .select()
      .from(chatChannelGroups)
      .where(and(eq(chatChannelGroups.id, groupId), eq(chatChannelGroups.userId, userId)))
      .limit(1)
    if (!group) throw new NotFoundException('Channel group not found')
    return group
  }

  async createChannelGroup(workspaceId: string, userId: string, name: string) {
    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!membership) throw new ForbiddenException('Workspace membership required')
    const [{ next } = { next: 0 }] = await this.db
      .select({ next: sql<number>`coalesce(max(${chatChannelGroups.position}), -1) + 1` })
      .from(chatChannelGroups)
      .where(and(eq(chatChannelGroups.workspaceId, workspaceId), eq(chatChannelGroups.userId, userId)))
    const [row] = await this.db
      .insert(chatChannelGroups)
      .values({ workspaceId, userId, name: this.normalizeGroupName(name), position: next })
      .returning()
    return { ...row, channelIds: [] as string[] }
  }

  async updateChannelGroup(
    groupId: string,
    userId: string,
    patch: { name?: string; isCollapsed?: boolean; position?: number },
  ) {
    await this.assertOwnGroup(groupId, userId)
    const set: Partial<{ name: string; isCollapsed: boolean; position: number }> = {}
    if (patch.name !== undefined) set.name = this.normalizeGroupName(patch.name)
    if (patch.isCollapsed !== undefined) set.isCollapsed = !!patch.isCollapsed
    if (patch.position !== undefined) set.position = Math.max(0, Math.floor(patch.position))
    if (Object.keys(set).length === 0) return this.assertOwnGroup(groupId, userId)
    const [row] = await this.db
      .update(chatChannelGroups)
      .set(set)
      .where(eq(chatChannelGroups.id, groupId))
      .returning()
    return row
  }

  /** Delete a group. Its channels fall back to space-derived grouping. */
  async deleteChannelGroup(groupId: string, userId: string) {
    await this.assertOwnGroup(groupId, userId)
    await this.db.delete(chatChannelGroups).where(eq(chatChannelGroups.id, groupId))
    return { ok: true }
  }

  /**
   * File a channel into one of the caller's groups (§A3.4). A channel lives in
   * at most one group per user, so this clears any previous placement first —
   * otherwise the rail would render the channel under two headings.
   */
  async addChannelToGroup(groupId: string, userId: string, channelId: string) {
    const group = await this.assertOwnGroup(groupId, userId)
    const channel = await this.assertChannelAccess(channelId, userId)
    if (channel.workspaceId !== group.workspaceId) {
      throw new BadRequestException('Channel belongs to another workspace')
    }
    const mine = await this.db
      .select({ id: chatChannelGroups.id })
      .from(chatChannelGroups)
      .where(and(eq(chatChannelGroups.workspaceId, group.workspaceId), eq(chatChannelGroups.userId, userId)))
    await this.db
      .delete(chatChannelGroupItems)
      .where(
        and(
          eq(chatChannelGroupItems.channelId, channelId),
          inArray(chatChannelGroupItems.groupId, mine.map((g) => g.id)),
        ),
      )
    const [{ next } = { next: 0 }] = await this.db
      .select({ next: sql<number>`coalesce(max(${chatChannelGroupItems.position}), -1) + 1` })
      .from(chatChannelGroupItems)
      .where(eq(chatChannelGroupItems.groupId, groupId))
    await this.db.insert(chatChannelGroupItems).values({ groupId, channelId, position: next })
    return { ok: true }
  }

  async removeChannelFromGroup(groupId: string, userId: string, channelId: string) {
    await this.assertOwnGroup(groupId, userId)
    await this.db
      .delete(chatChannelGroupItems)
      .where(and(eq(chatChannelGroupItems.groupId, groupId), eq(chatChannelGroupItems.channelId, channelId)))
    return { ok: true }
  }

  async joinChannel(channelId: string, userId: string) {
    const access = await this.assertChannelAccess(channelId, userId)
    // A share is permission to look, not an invitation to join. Letting a
    // share-only visitor become a member would survive the share being revoked.
    if (this.isShareOnlyVisitor(access)) {
      throw new ForbiddenException('This channel was shared with you; ask a member to add you to join it')
    }
    await this.db
      .insert(chatChannelMembers)
      .values({ channelId, userId })
      .onConflictDoNothing()
    return { ok: true }
  }

  /** Add other workspace members to a channel (enables group conversations). */
  async addChannelMembers(channelId: string, actorId: string, userIds: string[]) {
    const channel = await this.assertChannelAccess(channelId, actorId)
    const unique = [...new Set((userIds ?? []).filter(Boolean))]
    if (unique.length === 0) return { ok: true, added: 0 }
    // Only add users who belong to the channel's workspace.
    const wsMembers = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, channel.workspaceId), inArray(workspaceMembers.userId, unique)))
    const valid = wsMembers.map((m) => m.userId)
    if (valid.length === 0) return { ok: true, added: 0 }
    await this.db
      .insert(chatChannelMembers)
      .values(valid.map((userId) => ({ channelId, userId })))
      .onConflictDoNothing()
    this.realtime.emitToWorkspace(channel.workspaceId, {
      type: 'chat.channel.members.added',
      workspaceId: channel.workspaceId,
      channelId,
    })
    return { ok: true, added: valid.length }
  }

  async listChannelMembers(channelId: string, userId: string) {
    await this.assertChannelAccess(channelId, userId)
    return this.db
      .select({
        userId: chatChannelMembers.userId,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        joinedAt: chatChannelMembers.joinedAt,
      })
      .from(chatChannelMembers)
      .innerJoin(users, eq(users.id, chatChannelMembers.userId))
      .where(eq(chatChannelMembers.channelId, channelId))
      .orderBy(asc(chatChannelMembers.joinedAt))
  }

  /**
   * Read state per channel member (Plan §6 read receipts). A member has "seen"
   * a message when their lastReadAt (set on opening the channel) is at/after the
   * message's createdAt — so the client can render "Seen by …" per message
   * without a per-message receipts table.
   */
  async getChannelReceipts(channelId: string, userId: string) {
    await this.assertChannelAccess(channelId, userId)
    return this.db
      .select({
        userId: chatChannelMembers.userId,
        displayName: users.displayName,
        lastReadAt: chatChannelMembers.lastReadAt,
        // Delivery marker (Plan §6.2): drives the "Delivered" state that precedes
        // "Seen" on the sender's own messages.
        lastDeliveredAt: chatChannelMembers.lastDeliveredAt,
      })
      .from(chatChannelMembers)
      .innerJoin(users, eq(users.id, chatChannelMembers.userId))
      .where(eq(chatChannelMembers.channelId, channelId))
  }

  async leaveChannel(channelId: string, userId: string) {
    await this.assertChannelAccess(channelId, userId)
    await this.db
      .delete(chatChannelMembers)
      .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    return { ok: true }
  }

  // --- Custom workspace emoji (Plan §6) -----------------------------------
  private async assertWorkspaceRole(workspaceId: string, userId: string): Promise<string> {
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!m) throw new ForbiddenException('Workspace membership required')
    return m.role
  }

  async listCustomEmoji(workspaceId: string, userId: string) {
    await this.assertWorkspaceRole(workspaceId, userId)
    const rows = await this.db
      .select({
        id: chatCustomEmoji.id,
        shortcode: chatCustomEmoji.shortcode,
        imageUrl: chatCustomEmoji.imageUrl,
        storageKey: chatCustomEmoji.storageKey,
        createdById: chatCustomEmoji.createdById,
      })
      .from(chatCustomEmoji)
      .where(eq(chatCustomEmoji.workspaceId, workspaceId))
      .orderBy(asc(chatCustomEmoji.shortcode))
    // Uploaded emoji (§A3.8) are stored by object key, so their URL is signed
    // fresh on every read; emoji added by URL pass through untouched.
    return Promise.all(
      rows.map(async ({ storageKey, ...emoji }) => ({
        ...emoji,
        imageUrl: storageKey ? await this.emojiImageUrl(workspaceId, storageKey) : emoji.imageUrl,
      })),
    )
  }

  /**
   * An uploaded emoji's image, signed fresh — but only a key of this
   * workspace's emoji shape. One recorded before `addCustomEmoji` checked the
   * shape draws nothing rather than someone else's object.
   */
  private async emojiImageUrl(workspaceId: string, key: string): Promise<string | null> {
    if (!isKeyDirectlyUnder(key, `chat/${workspaceId}/emoji/`)) return null
    return this.r2.configured ? this.r2.getObjectUrl(key) : key
  }

  /**
   * Presign a direct-to-R2 upload for a custom emoji image (§A3.8). Mirrors the
   * attachment presign path so emoji can be uploaded instead of only linked.
   */
  async createCustomEmojiUploadUrl(
    workspaceId: string,
    userId: string,
    body: { fileName: string; contentType: string; sizeBytes?: number },
  ) {
    await this.assertWorkspaceRole(workspaceId, userId)
    if (!this.r2.configured) throw new BadRequestException('R2 storage is not configured')
    const contentType = body.contentType || ''
    if (!contentType.startsWith('image/')) throw new BadRequestException('Emoji must be an image')
    if (body.sizeBytes != null && body.sizeBytes > MAX_CUSTOM_EMOJI_BYTES) {
      throw new BadRequestException(`Emoji image exceeds the ${Math.round(MAX_CUSTOM_EMOJI_BYTES / 1024)} KB limit`)
    }
    const fileName = safeFileName(body.fileName)
    const key = `chat/${workspaceId}/emoji/${Date.now()}-${fileName}`
    const uploadUrl = await this.r2.presignPutObject(key, contentType, { uploadedby: userId })
    return { uploadUrl, storageKey: key }
  }

  async addCustomEmoji(
    workspaceId: string,
    userId: string,
    shortcode: string,
    imageUrl: string,
    storageKey?: string,
  ) {
    await this.assertWorkspaceRole(workspaceId, userId)
    const code = (shortcode ?? '').trim().toLowerCase().replace(/:/g, '')
    if (!/^[a-z0-9_]{2,32}$/.test(code)) {
      throw new BadRequestException('Shortcode must be 2–32 lowercase letters, numbers, or underscores')
    }
    // An uploaded emoji is identified by its object key; imageUrl then only
    // holds the signature that was current at upload time, so it is never
    // trusted on read.
    const key = storageKey?.trim()
    if (key) {
      // The shape, not the prefix: `chat/<ws>/emoji/../../…` passed the
      // `startsWith` this was, and a public-CDN URL collapses the dots.
      if (!isKeyDirectlyUnder(key, `chat/${workspaceId}/emoji/`)) throw new BadRequestException('Invalid storageKey')
    } else if (!/^https?:\/\/\S+$/.test(imageUrl ?? '')) {
      throw new BadRequestException('imageUrl must be an http(s) URL')
    }
    const [row] = await this.db
      .insert(chatCustomEmoji)
      .values({ workspaceId, shortcode: code, imageUrl: imageUrl ?? '', storageKey: key ?? null, createdById: userId })
      .onConflictDoNothing()
      .returning()
    if (!row) throw new BadRequestException(`:${code}: already exists in this workspace`)
    return {
      ...row,
      imageUrl: key ? await this.emojiImageUrl(workspaceId, key) : row.imageUrl,
    }
  }

  async deleteCustomEmoji(emojiId: string, userId: string) {
    const [emoji] = await this.db.select().from(chatCustomEmoji).where(eq(chatCustomEmoji.id, emojiId))
    if (!emoji) throw new NotFoundException('Emoji not found')
    const role = await this.assertWorkspaceRole(emoji.workspaceId, userId)
    const isModerator = role === 'workspace_admin' || role === 'super_admin'
    if (emoji.createdById !== userId && !isModerator) {
      throw new ForbiddenException('Only the creator or a workspace admin can delete this emoji')
    }
    await this.db.delete(chatCustomEmoji).where(eq(chatCustomEmoji.id, emojiId))
    return { ok: true }
  }

  /** Remove another member from a channel (Plan §6). Only the channel creator
   *  or a workspace admin may do this; the creator can't be removed. */
  async removeChannelMember(channelId: string, actorId: string, targetUserId: string) {
    const channel = await this.assertChannelAccess(channelId, actorId)
    if (targetUserId === actorId) {
      // Removing yourself is "leave", not "remove".
      return this.leaveChannel(channelId, actorId)
    }
    if (!(await this.canModerateChannel(channel, actorId))) {
      throw new ForbiddenException('Only the channel creator or a workspace admin can remove members')
    }
    if (channel.createdById === targetUserId) {
      throw new ForbiddenException('The channel creator cannot be removed')
    }
    await this.db
      .delete(chatChannelMembers)
      .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, targetUserId)))
    this.realtime.emitToWorkspace(channel.workspaceId, {
      type: 'chat.channel.members.updated',
      workspaceId: channel.workspaceId,
      channelId,
    })
    return { ok: true }
  }

  async listMessages(channelId: string, userId: string, opts: { limit?: number; before?: string } = {}) {
    await this.assertChannelAccess(channelId, userId)
    const limit = Math.min(opts.limit ?? 50, 201)
    // Keyset pagination (§6): when a `before` message id is supplied, only load
    // root messages strictly older than that message so the client can page
    // backwards through channel history. Without this the cursor was a no-op
    // and only the newest `limit` messages were ever reachable.
    //
    // COMPARED IN THE DATABASE, AT THE COLUMN'S PRECISION, TIES BROKEN BY ID.
    // The anchor's timestamp used to come back as a JS Date — milliseconds —
    // and `created_at < that` then skipped every message written in the same
    // millisecond as the anchor but before it, and every message at the same
    // instant: they fell between two pages and were never shown. And a cursor
    // that named no message in this channel was IGNORED, answering with the
    // newest page again — so a client paging back got the same page for ever.
    if (opts.before) {
      const [anchor] = await this.db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, opts.before),
            eq(chatMessages.channelId, channelId),
            isNull(chatMessages.parentMessageId),
          ),
        )
        .limit(1)
      if (!anchor) throw new BadRequestException('before must be a message in this channel')
    }
    const where = and(
      eq(chatMessages.channelId, channelId),
      isNull(chatMessages.parentMessageId),
      opts.before
        ? sql`(${chatMessages.createdAt}, ${chatMessages.id}) < (select m.created_at, m.id from ${chatMessages} m where m.id = ${opts.before})`
        : undefined,
    )
    const rows = await this.db
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        authorId: chatMessages.authorId,
        body: chatMessages.body,
        mentions: chatMessages.mentions,
        editedAt: chatMessages.editedAt,
        pinnedAt: chatMessages.pinnedAt,
        pinnedById: chatMessages.pinnedById,
        deletedAt: chatMessages.deletedAt,
        createdAt: chatMessages.createdAt,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
        // §12 — where this was forwarded from, if it was.
        forwardedFromId: chatMessages.forwardedFromId,
        // §2.8 gap 9 — set when this message IS a call card.
        callId: chatMessages.callId,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(where)
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(limit)
    const ordered = rows.reverse()
    if (ordered.length === 0) return ordered

    // Delivery/read receipts of the OTHER members (Plan §6.2) so each of the
    // caller's own messages can carry a 'sent' | 'delivered' | 'seen' status.
    const otherMembers = await this.db
      .select({
        lastReadAt: chatChannelMembers.lastReadAt,
        lastDeliveredAt: chatChannelMembers.lastDeliveredAt,
      })
      .from(chatChannelMembers)
      .where(and(eq(chatChannelMembers.channelId, channelId), ne(chatChannelMembers.userId, userId)))

    const messageIds = ordered.map((m) => m.id)
    const reactionRows = await this.db
      .select({
        messageId: chatMessageReactions.messageId,
        emoji: chatMessageReactions.emoji,
        userId: chatMessageReactions.userId,
      })
      .from(chatMessageReactions)
      .where(or(...messageIds.map((id) => eq(chatMessageReactions.messageId, id))))

    const grouped = new Map<string, Map<string, Set<string>>>()
    for (const reaction of reactionRows) {
      const byEmoji = grouped.get(reaction.messageId) ?? new Map<string, Set<string>>()
      const users = byEmoji.get(reaction.emoji) ?? new Set<string>()
      users.add(reaction.userId)
      byEmoji.set(reaction.emoji, users)
      grouped.set(reaction.messageId, byEmoji)
    }

    // Reactor identities (Plan §6.5): map each reactor id → display name so the
    // client can show "Alice, Bob reacted with 👍" on the reaction pill.
    const reactorIds = [...new Set(reactionRows.map((r) => r.userId))]
    const reactorNames = reactorIds.length
      ? await this.db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, reactorIds))
      : []
    const reactorNameById = new Map(reactorNames.map((r) => [r.id, r.name]))
    const reactorUsers = (ids: Set<string>) =>
      [...ids].map((id) => ({ id, name: reactorNameById.get(id) ?? 'teammate' }))

    // Hydrate per-message attachments (Plan §6.8). Separate query, keyed by
    // message id, with fresh signed download URLs.
    const attachmentRows = await this.db
      .select()
      .from(chatMessageAttachments)
      .where(inArray(chatMessageAttachments.messageId, messageIds))
    const attachmentsByMessage = new Map<string, Array<{ id: string; fileName: string; contentType: string; sizeBytes: number; storageKey: string; url: string | null }>>()
    for (const a of attachmentRows) {
      if (!a.messageId) continue
      const list = attachmentsByMessage.get(a.messageId) ?? []
      list.push({
        id: a.id,
        fileName: a.fileName,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        storageKey: a.storageKey,
        url: await this.chatAttachmentUrl(a),
      })
      attachmentsByMessage.set(a.messageId, list)
    }

    // Thread stats (Plan §6.4): per root message, the reply count and the latest
    // reply's timestamp so the parent can render "Last reply 3h ago" inline.
    // Deleted-tombstone replies still count (they occupy the thread).
    const replyStatRows = await this.db
      .select({
        parentId: chatMessages.parentMessageId,
        replyCount: sql<number>`count(*)::int`,
        lastReplyAt: sql<string | null>`max(${chatMessages.createdAt})`,
      })
      .from(chatMessages)
      .where(inArray(chatMessages.parentMessageId, messageIds))
      .groupBy(chatMessages.parentMessageId)
    const replyStatByParent = new Map(
      replyStatRows.map((r) => [r.parentId as string, { replyCount: r.replyCount, lastReplyAt: r.lastReplyAt }]),
    )

    /*
     * §12 — resolve where each forwarded message came from, for "View Message".
     *
     * Access is re-checked here against *the reader*, not the forwarder. Those
     * are different people: forwarding was authorised when it happened, against
     * whoever did it, and the recipient may have no business in the source
     * channel at all. Offering them a link would be an invitation to a room
     * they were never in. When the source is out of reach the message still
     * says it was forwarded — it just does not offer to take you there, which
     * is the truthful version of the same fact.
     */
    const forwardIds = [...new Set(ordered.map((m) => m.forwardedFromId).filter(Boolean))] as string[]
    const forwardedFrom = new Map<
      string,
      {
        channelId: string
        channelName: string | null
        // §G11-1 — who wrote it and when. A forward that says only "Forwarded"
        // strips the two facts that make it worth anything: a quote with no
        // attribution and no date is a rumour.
        authorName: string | null
        sentAt: Date | null
      } | null
    >()
    if (forwardIds.length > 0) {
      const sources = await this.db
        .select({
          id: chatMessages.id,
          channelId: chatChannels.id,
          channelName: chatChannels.name,
          isPrivate: chatChannels.isPrivate,
          isDm: chatChannels.isDm,
          authorName: users.displayName,
          sentAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
        // Left, not inner: a deleted author must not make the whole forward
        // banner disappear along with them.
        .leftJoin(users, eq(users.id, chatMessages.authorId))
        .where(inArray(chatMessages.id, forwardIds))
      const myChannels = new Set(
        (
          await this.db
            .select({ channelId: chatChannelMembers.channelId })
            .from(chatChannelMembers)
            .where(eq(chatChannelMembers.userId, userId))
        ).map((r) => r.channelId),
      )
      for (const src of sources) {
        const reachable = (!src.isPrivate && !src.isDm) || myChannels.has(src.channelId)
        forwardedFrom.set(
          src.id,
          reachable
            ? {
                channelId: src.channelId,
                channelName: src.channelName,
                authorName: src.authorName,
                sentAt: src.sentAt,
              }
            : null,
        )
      }
    }

    /*
     * §2.8 gap 9 — hydrate the call behind each card.
     *
     * The card is not a snapshot of the moment the call started: it has to say
     * "You're in the SyncUp", "Join the SyncUp" or "SyncUp Ended · lasted 45s"
     * depending on what is true NOW, an hour later, for whoever is reading. So
     * it carries live state rather than frozen text, and the reader's own
     * presence is resolved here — the client cannot be trusted to know whether
     * a `leftAt` it has not refetched is still null.
     */
    const callIds = [...new Set(ordered.map((m) => m.callId).filter(Boolean))] as string[]
    const callById = new Map<string, ChatCallCard>()
    if (callIds.length > 0) {
      const callRows = await this.db
        .select({
          id: calls.id,
          startedAt: calls.startedAt,
          endedAt: calls.endedAt,
          recording: calls.recording,
          startedById: calls.startedById,
        })
        .from(calls)
        .where(inArray(calls.id, callIds))
      const participantRows = await this.db
        .select({
          callId: callParticipants.callId,
          userId: callParticipants.userId,
          leftAt: callParticipants.leftAt,
        })
        .from(callParticipants)
        .where(inArray(callParticipants.callId, callIds))
      for (const call of callRows) {
        const mine = participantRows.filter((p) => p.callId === call.id)
        callById.set(call.id, {
          ...call,
          startedAt: call.startedAt.toISOString(),
          endedAt: call.endedAt ? call.endedAt.toISOString() : null,
          // Everyone who was ever in it — "1 person joined" is a fact about the
          // whole call, not about who happens to be there as you read this.
          joinedCount: new Set(mine.map((p) => p.userId)).size,
          presentCount: mine.filter((p) => !p.leftAt).length,
          youArePresent: mine.some((p) => p.userId === userId && !p.leftAt),
        })
      }
    }

    /*
     * §G11 [15:36] — who this message is assigned to, and whether it is done.
     *
     * Hydrated with the messages rather than fetched per message on hover: an
     * assignment has to be visible on the message itself, otherwise it is a
     * fact you can only discover by opening the menu that created it, which is
     * the same as not having it.
     */
    const assignmentRows = await this.db
      .select({
        id: chatMessageAssignments.id,
        messageId: chatMessageAssignments.messageId,
        assigneeId: chatMessageAssignments.assigneeId,
        assignedById: chatMessageAssignments.assignedById,
        dueAt: chatMessageAssignments.dueAt,
        resolvedAt: chatMessageAssignments.resolvedAt,
        assigneeName: users.displayName,
        assigneeAvatarUrl: users.avatarUrl,
      })
      .from(chatMessageAssignments)
      .leftJoin(users, eq(users.id, chatMessageAssignments.assigneeId))
      .where(inArray(chatMessageAssignments.messageId, messageIds))
    const assignmentsByMessage = new Map<string, typeof assignmentRows>()
    for (const a of assignmentRows) {
      const list = assignmentsByMessage.get(a.messageId) ?? []
      list.push(a)
      assignmentsByMessage.set(a.messageId, list)
    }

    /*
     * §G12 [17:13] — the reader's own stance on each thread.
     *
     * Only rows for threads on this page, and only this reader's: "muted" is a
     * private decision, and showing the bell struck through on somebody else's
     * screen would leak it.
     */
    const followRows = await this.db
      .select({ parentMessageId: chatThreadFollows.parentMessageId, state: chatThreadFollows.state })
      .from(chatThreadFollows)
      .where(
        and(
          eq(chatThreadFollows.userId, userId),
          inArray(chatThreadFollows.parentMessageId, messageIds),
        ),
      )
    const followByParent = new Map(followRows.map((r) => [r.parentMessageId, r.state]))

    return ordered.map((message) => {
      const byEmoji = grouped.get(message.id)
      const reactions =
        byEmoji
          ? [...byEmoji.entries()].map(([emoji, ids]) => ({
              emoji,
              count: ids.size,
              reacted: ids.has(userId),
              users: reactorUsers(ids),
            }))
          : []
      const stats = replyStatByParent.get(message.id)
      // Delivery indicator only for the caller's own messages (Plan §6.2);
      // null for others so the UI never renders it on someone else's message.
      const deliveryStatus =
        message.authorId === userId ? computeDeliveryStatus(message.createdAt, otherMembers) : null
      return {
        ...message,
        // null when it was forwarded from somewhere this reader cannot follow.
        forwardedFrom: message.forwardedFromId
          ? forwardedFrom.get(message.forwardedFromId) ?? null
          : null,
        reactions,
        attachments: attachmentsByMessage.get(message.id) ?? [],
        replyCount: stats?.replyCount ?? 0,
        lastReplyAt: stats?.lastReplyAt ?? null,
        deliveryStatus,
        // §2.8 gap 9 — null on an ordinary message; the card's live state on a
        // call card. Null on a card whose call has been deleted, too, which is
        // why the message keeps its plain-words body.
        call: message.callId ? callById.get(message.callId) ?? null : null,
        // §G11 — empty on a message nobody has been asked to act on.
        assignments: (assignmentsByMessage.get(message.id) ?? []).map((a) => ({
          id: a.id,
          assigneeId: a.assigneeId,
          assigneeName: a.assigneeName,
          assigneeAvatarUrl: a.assigneeAvatarUrl,
          assignedById: a.assignedById,
          dueAt: a.dueAt,
          resolvedAt: a.resolvedAt,
        })),
        // §G12 — 'following' | 'muted' | null, meaning "I have not said".
        threadFollowState: followByParent.get(message.id) ?? null,
      }
    })
  }

  async getMemberActivity(workspaceId: string, requesterId: string, memberUserId: string, limit = 30) {
    const [requesterMembership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, requesterId)))
      .limit(1)
    if (!requesterMembership) throw new ForbiddenException('Workspace membership required')

    const [memberMembership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberUserId)))
      .limit(1)
    if (!memberMembership) return []

    /*
     * ONLY FROM CHANNELS THE REQUESTER CAN READ. This returned everything the
     * member wrote anywhere in the workspace: measured on lane 1, a member
     * refused a DM and a private channel (403 on each) read both through
     * another member's activity, "DM SECRET" included. The requester's own
     * channel rule applies now, the SQL twin of `assertChannelAccess`.
     */
    return this.db
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        channelName: chatChannels.name,
        body: chatMessages.body,
        parentMessageId: chatMessages.parentMessageId,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .where(
        and(
          eq(chatChannels.workspaceId, workspaceId),
          eq(chatMessages.authorId, memberUserId),
          readableChannelsFilter(this.db, requesterId, workspaceId),
        ),
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100))
  }

  async getMessageById(messageId: string, userId: string) {
    const [row] = await this.db
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        authorId: chatMessages.authorId,
        body: chatMessages.body,
        mentions: chatMessages.mentions,
        parentMessageId: chatMessages.parentMessageId,
        editedAt: chatMessages.editedAt,
        pinnedAt: chatMessages.pinnedAt,
        createdAt: chatMessages.createdAt,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(eq(chatMessages.id, messageId))
      .limit(1)
    if (!row) throw new NotFoundException('Message not found')

    await this.assertChannelAccess(row.channelId, userId)

    const reactionRows = await this.db
      .select({
        emoji: chatMessageReactions.emoji,
        userId: chatMessageReactions.userId,
      })
      .from(chatMessageReactions)
      .where(eq(chatMessageReactions.messageId, messageId))

    const grouped = new Map<string, Set<string>>()
    for (const reaction of reactionRows) {
      const usersForEmoji = grouped.get(reaction.emoji) ?? new Set<string>()
      usersForEmoji.add(reaction.userId)
      grouped.set(reaction.emoji, usersForEmoji)
    }
    // Reactor identities (Plan §6.5) so the pill tooltip can name who reacted.
    const reactorIds = [...new Set(reactionRows.map((r) => r.userId))]
    const reactorNames = reactorIds.length
      ? await this.db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, reactorIds))
      : []
    const reactorNameById = new Map(reactorNames.map((r) => [r.id, r.name]))
    const reactions = [...grouped.entries()].map(([emoji, usersForEmoji]) => ({
      emoji,
      count: usersForEmoji.size,
      reacted: usersForEmoji.has(userId),
      users: [...usersForEmoji].map((id) => ({ id, name: reactorNameById.get(id) ?? 'teammate' })),
    }))

    /*
     * §G12 — the reader's stance, same field name listMessages uses.
     *
     * The thread panel prefers the message from the loaded page and falls back
     * to this one when the parent has scrolled out of it. If only one of the
     * two carried the stance, the bell would light up or not depending on how
     * far you had scrolled, which is the sort of bug that gets filed as
     * "sometimes it forgets".
     */
    const [stance] = await this.db
      .select({ state: chatThreadFollows.state })
      .from(chatThreadFollows)
      .where(
        and(
          eq(chatThreadFollows.parentMessageId, row.parentMessageId ?? row.id),
          eq(chatThreadFollows.userId, userId),
        ),
      )
      .limit(1)

    return { ...row, reactions, threadFollowState: stance?.state ?? null }
  }

  async getThread(messageId: string, userId: string, limit = 100, before?: string) {
    /*
     * §G12-2 — a thread is the same thread whichever message in it you name.
     *
     * Rooted at the parent, not at the id passed in. The Replies page opens a
     * thread from a NOTIFICATION, and a reply notification carries the id of
     * the reply — so asking for that id returned the reply as the "parent" with
     * an empty list of replies under it: a thread that reads as having nothing
     * in it, which is the opposite of why you opened it.
     */
    const named = await this.getMessageById(messageId, userId)
    const parent = named.parentMessageId
      ? await this.getMessageById(named.parentMessageId, userId)
      : named
    /*
     * THE NEWEST REPLIES, NOT THE OLDEST. This read the first `limit` replies
     * in time order, so a thread past a hundred replies showed its first
     * hundred and never the ones being written now — the end a reader opens a
     * thread for. Newest first, handed back in reading order, with `hasOlder`
     * and a `before` cursor (compared in the database, ties by id) for the
     * rest.
     */
    const size = Math.min(Math.max(limit, 1), 200)
    if (before) {
      const [anchor] = await this.db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(and(eq(chatMessages.id, before), eq(chatMessages.parentMessageId, parent.id)))
        .limit(1)
      if (!anchor) throw new BadRequestException('before must be a reply in this thread')
    }
    const rows = await this.db
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        authorId: chatMessages.authorId,
        body: chatMessages.body,
        mentions: chatMessages.mentions,
        parentMessageId: chatMessages.parentMessageId,
        editedAt: chatMessages.editedAt,
        pinnedAt: chatMessages.pinnedAt,
        createdAt: chatMessages.createdAt,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(
        and(
          eq(chatMessages.parentMessageId, parent.id),
          before
            ? sql`(${chatMessages.createdAt}, ${chatMessages.id}) < (select m.created_at, m.id from ${chatMessages} m where m.id = ${before})`
            : undefined,
        ),
      )
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      // One more than asked for, never returned: whether it came back is
      // whether there are older replies.
      .limit(size + 1)

    const hasOlder = rows.length > size
    return { parent, replies: rows.slice(0, size).reverse(), hasOlder }
  }

  async postMessage(data: {
    channelId: string
    authorId: string
    body: string
    parentMessageId?: string | null
    mentions?: Array<{ userId: string; offset?: number; length?: number }>
    attachmentIds?: string[]
    /** §12 — the message this one is a forward of. */
    forwardedFromId?: string | null
  }) {
    this.assertCanPost(await this.assertChannelAccess(data.channelId, data.authorId))
    const body = data.body.trim()
    const attachmentIds = (data.attachmentIds ?? []).filter(Boolean)
    // A message must carry either text or at least one attachment (Plan §6.8).
    if (!body && attachmentIds.length === 0) throw new ForbiddenException('Message body required')
    const [channel] = await this.db.select().from(chatChannels).where(eq(chatChannels.id, data.channelId))
    if (!channel) throw new NotFoundException('Channel not found')

    const parsedMentionIds = this.extractMentionIds(body)
    const mentionIds = new Set([
      ...(data.mentions ?? []).map((m) => m.userId),
      ...parsedMentionIds,
    ])
    const normalizedMentions = [...mentionIds].map((userId) => ({ userId, offset: 0, length: 0 }))

    /*
     * §12 — forwarding, checked before it is recorded.
     *
     * The id names a message in some other channel, so it has to be read
     * through the same access check as everything else: without it, forwarding
     * a message you cannot see would mint a permanent link to it, and "View
     * Message" would be an invitation to a channel you were never in. An
     * unreadable or unknown source is dropped rather than refused — the forward
     * still lands, just as an ordinary message, which is what it is without a
     * source anyone can follow.
     */
    let forwardedFromId: string | null = null
    if (data.forwardedFromId) {
      const [source] = await this.db
        .select({ id: chatMessages.id, channelId: chatMessages.channelId })
        .from(chatMessages)
        .where(eq(chatMessages.id, data.forwardedFromId))
        .limit(1)
      if (source) {
        const readable = await this.assertChannelAccess(source.channelId, data.authorId).then(
          () => true,
          () => false,
        )
        if (readable) forwardedFromId = source.id
      }
    }

    const [row] = await this.db
      .insert(chatMessages)
      .values({
        channelId: data.channelId,
        authorId: data.authorId,
        body,
        parentMessageId: data.parentMessageId ?? null,
        mentions: normalizedMentions.length > 0 ? normalizedMentions : null,
        forwardedFromId,
      })
      .returning()

    // Link any pre-uploaded attachments to this message. Only rows belonging to
    // this channel and still unlinked (message_id null) are claimed, so an id
    // can't be smuggled across channels or re-attached to a second message.
    let attachments: Array<{ id: string; fileName: string; contentType: string; sizeBytes: number; storageKey: string; url: string | null }> = []
    if (attachmentIds.length > 0) {
      const linked = await this.db
        .update(chatMessageAttachments)
        .set({ messageId: row.id })
        .where(
          and(
            eq(chatMessageAttachments.channelId, data.channelId),
            isNull(chatMessageAttachments.messageId),
            inArray(chatMessageAttachments.id, attachmentIds),
          ),
        )
        .returning()
      attachments = await Promise.all(
        linked.map(async (a) => ({
          id: a.id,
          fileName: a.fileName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          storageKey: a.storageKey,
          url: await this.chatAttachmentUrl(a),
        })),
      )
    }

    const [author] = await this.db.select({ displayName: users.displayName, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, data.authorId))
    const enriched = { ...row, authorName: author?.displayName, authorAvatarUrl: author?.avatarUrl, attachments, reactions: [] as Array<{ emoji: string; count: number; reacted: boolean }> }

    let channelLabel = `#${channel.name}`
    if (channel.isDm) {
      const dmMembers = await this.db
        .select({
          userId: chatChannelMembers.userId,
          displayName: users.displayName,
        })
        .from(chatChannelMembers)
        .leftJoin(users, eq(users.id, chatChannelMembers.userId))
        .where(eq(chatChannelMembers.channelId, data.channelId))
      const peer = dmMembers.find((m) => m.userId !== data.authorId)
      channelLabel = peer?.displayName ? peer.displayName : 'Direct message'
    }

    await this.emitToChannel(channel, {
      type: 'chat.message.created',
      workspaceId: channel.workspaceId,
      channelId: data.channelId,
      message: enriched,
    })

    /*
     * ONLY THOSE WHO MAY READ THE CHANNEL HEAR OF A MESSAGE IN IT. Every member
     * row was told, with the message's first 180 characters — and a public
     * channel's rows are only people having opened it, a guest's among them
     * from before a guest read what is shared with them; and a mention reached
     * anybody named, outside a private channel too
     * (`found-24-sep/guests-read-every-open-channel`).
     */
    const audience = await channelReaders(this.db, channel)
    const reached = new Set(audience.users)
    const guestIds = audience.workspace
      ? new Set(
          (
            await this.db
              .select({ id: workspaceMembers.userId })
              .from(workspaceMembers)
              .where(and(eq(workspaceMembers.workspaceId, channel.workspaceId), eq(workspaceMembers.role, 'guest')))
          ).map((r) => r.id),
        )
      : new Set<string>()
    const mayRead = (userId: string) => (audience.workspace ? !guestIds.has(userId) || reached.has(userId) : reached.has(userId))

    // Per-channel notification levels: 'all' (default) hears every message,
    // 'mentions' only @-mentions, 'none' is muted. Load member ids + levels once.
    const levelRows = await this.db
      .select({ userId: chatChannelMembers.userId, level: chatChannelMembers.notificationLevel })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.channelId, data.channelId))
    const levelByUser = new Map(levelRows.map((r) => [r.userId, r.level]))
    const channelMemberIds = levelRows.map((r) => r.userId)

    /*
     * §G12 [17:13] — per-thread mute and follow, which override the channel.
     *
     * "10 groups mein se ek thread bohot noisy hai" — silencing the channel to
     * escape one thread also silences the messages you are there for, so the
     * more specific answer wins over the channel-wide one in BOTH directions:
     * muted beats level 'all', and following beats level 'none'.
     *
     * Only for replies. A root message is not in a thread yet, so there is
     * nothing about it anybody can have muted.
     */
    const threadRootId = data.parentMessageId ?? null
    const threadStanceByUser = new Map<string, 'following' | 'muted'>()
    if (threadRootId) {
      const stanceRows = await this.db
        .select({ userId: chatThreadFollows.userId, state: chatThreadFollows.state })
        .from(chatThreadFollows)
        .where(eq(chatThreadFollows.parentMessageId, threadRootId))
      for (const s of stanceRows) threadStanceByUser.set(s.userId, s.state)
    }

    // Broadcast mentions @here / @channel (Plan §6.9): fan a mention-level ping
    // out to (present) channel members, respecting each member's DND + level.
    const special = this.extractSpecialMentions(body)
    const broadcastTargets = await this.resolveBroadcastTargets(
      data.channelId,
      data.authorId,
      special,
      channelMemberIds,
    )

    // Everyone who should get a *mention* ping: explicit @uuid mentions (verified
    // as workspace members), @team handles, plus @here/@channel broadcast targets.
    const mentionTargets = new Set<string>(broadcastTargets)
    const teamTargets = await this.resolveTeamMentionTargets(channel.workspaceId, body)
    if (mentionIds.size > 0 || teamTargets.size > 0) {
      const memberRows = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, channel.workspaceId))
      const workspaceMemberIds = new Set(memberRows.map((m) => m.userId))
      for (const userId of [...mentionIds, ...teamTargets]) {
        if (userId === data.authorId) continue
        if (!workspaceMemberIds.has(userId)) continue
        mentionTargets.add(userId)
      }
    }

    for (const userId of mentionTargets) {
      if (userId === data.authorId) continue
      if (!mayRead(userId)) continue
      // Muted members don't get pinged even on @mention / @channel.
      if ((levelByUser.get(userId) ?? 'all') === 'none') continue
      void this.notifications.create({
        userId,
        workspaceId: channel.workspaceId,
        actorId: data.authorId,
        type: 'task_mentioned',
        title: channel.isDm ? `You were mentioned by ${author?.displayName ?? 'a teammate'}` : `You were mentioned in ${channelLabel}`,
        body: body.slice(0, 180),
        target: {
          entityType: 'chat_message',
          entityId: row.id,
          url: `/app/${channel.workspaceId}/chat?channel=${data.channelId}&message=${row.id}`,
        },
        emailContext: { taskTitle: channelLabel, workspaceName: 'Workspace' },
      })
    }

    // Notify channel members about new messages (except author and already-mentioned users).
    const notifiedIds = new Set([...mentionTargets, data.authorId])
    for (const userId of channelMemberIds) {
      if (notifiedIds.has(userId)) continue
      if (!mayRead(userId)) continue
      const stance = threadStanceByUser.get(userId)
      // Muted this thread — the one case where a level of 'all' is not the
      // last word. A direct @mention still reaches them: that loop ran above,
      // deliberately, because you cannot hide from being named.
      if (stance === 'muted') continue
      // Following this thread — heard even at 'mentions' or 'none', which is
      // the point of asking to follow a thread inside a channel you muted.
      if (stance !== 'following' && (levelByUser.get(userId) ?? 'all') !== 'all') continue
      void this.notifications.create({
        userId,
        workspaceId: channel.workspaceId,
        actorId: data.authorId,
        // §14 — a reply into a thread is its own kind, so the Replies page can
        // find it. Typed as a plain chat_message it never could.
        type: data.parentMessageId ? 'chat_reply' : 'chat_message',
        title: data.parentMessageId
          ? channel.isDm
            ? `New reply from ${author?.displayName ?? 'a teammate'}`
            : `New reply in ${channelLabel}`
          : channel.isDm
            ? `New message from ${author?.displayName ?? 'a teammate'}`
            : `New message in ${channelLabel}`,
        body: body.slice(0, 180),
        target: {
          entityType: 'chat_message',
          entityId: row.id,
          url: `/app/${channel.workspaceId}/chat?channel=${data.channelId}&message=${row.id}`,
        },
        emailContext: { taskTitle: channelLabel, workspaceName: 'Workspace', commentSnippet: body.slice(0, 180) },
      })
    }

    // @Rundesk AI assistant (§7.6) — best-effort, fire-and-forget.
    void this.maybeAnswerAiMention(channel, data.authorId, body)

    return enriched
  }

  /**
   * Create a task from a chat message (Plan §6.10, §A3.5). Title defaults to the
   * message's first line; the full message becomes the description. An optional
   * assignee and due date turn it into a real action item rather than an
   * unowned, undated task nobody picks up.
   */
  async createTaskFromMessage(
    messageId: string,
    userId: string,
    requestedListId: string | undefined,
    title?: string,
    opts: { assigneeId?: string | null; dueAt?: string | null } = {},
  ) {
    const [message] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!message) throw new NotFoundException('Message not found')
    const channel = await this.assertChannelAccess(message.channelId, userId)
    /*
     * A list named by the caller, else the person's default for new tasks,
     * as `/task` chooses. The chat page chose the first list of the first
     * project of the first space itself and always named it, so the default
     * never applied (`found-24-sep/planner-default-list-read-by-nothing`).
     */
    const listId = requestedListId || (await this.tasks.defaultListFor(channel.workspaceId, userId))
    if (!listId) {
      throw new BadRequestException('No list is available to create a task in yet — create a space, project and list first.')
    }

    const firstLine = message.body.split('\n')[0].trim()
    const resolvedTitle = (title?.trim() || firstLine || 'Task from chat').slice(0, 200)
    let dueDate: Date | undefined
    if (opts.dueAt) {
      const parsed = new Date(opts.dueAt)
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException('dueAt must be a valid date')
      dueDate = parsed
    }
    const task = await this.tasks.createTask({
      listId,
      title: resolvedTitle,
      description: message.body,
      createdById: userId,
      assigneeIds: opts.assigneeId ? [opts.assigneeId] : undefined,
      dueDate,
    })
    return task
  }

  /**
   * Parse the "<when> <what>" tail of a `/remind` command into an absolute time
   * plus the reminder note (Plan §6.3). Understands a leading "me", relative
   * phrases ("in 20 minutes", "in 2 hours", "in 3 days", "tomorrow", "tonight")
   * and clock times ("at 3pm", "at 14:30"). Falls back to +1 hour when no time
   * phrase is recognised so the command always yields a real reminder.
   */
  parseReminderWhen(input: string, now: Date = new Date()): { when: Date; note: string; phrase: string } {
    let rest = (input ?? '').trim().replace(/^me\b[\s,]*/i, '').trim()
    let when: Date | null = null
    let phrase = ''

    const rel = /^in\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/i.exec(rest)
    const at = /^at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(rest)
    if (rel) {
      const n = Number(rel[1])
      const unit = rel[2].toLowerCase()
      const ms = /^h/.test(unit) ? n * 3_600_000 : /^d/.test(unit) ? n * 86_400_000 : n * 60_000
      when = new Date(now.getTime() + ms)
      phrase = rel[0]
      rest = rest.slice(rel[0].length).trim()
    } else if (/^tomorrow\b/i.test(rest)) {
      const d = new Date(now.getTime() + 86_400_000)
      d.setHours(9, 0, 0, 0)
      when = d
      phrase = 'tomorrow'
      rest = rest.replace(/^tomorrow\b/i, '').trim()
    } else if (/^tonight\b/i.test(rest)) {
      const d = new Date(now)
      d.setHours(20, 0, 0, 0)
      if (d.getTime() <= now.getTime()) d.setTime(d.getTime() + 86_400_000)
      when = d
      phrase = 'tonight'
      rest = rest.replace(/^tonight\b/i, '').trim()
    } else if (at) {
      let hour = Number(at[1]) % 24
      const min = at[2] ? Number(at[2]) : 0
      const mer = at[3]?.toLowerCase()
      if (mer === 'pm' && hour < 12) hour += 12
      if (mer === 'am' && hour === 12) hour = 0
      const d = new Date(now)
      d.setHours(hour, min, 0, 0)
      if (d.getTime() <= now.getTime()) d.setTime(d.getTime() + 86_400_000) // next day if already past
      when = d
      phrase = at[0]
      rest = rest.slice(at[0].length).trim()
    }

    if (!when) {
      when = new Date(now.getTime() + 3_600_000)
      phrase = 'in 1 hour'
    }
    // A leading "to " reads awkwardly as a task title ("to review the PR" → "review the PR").
    const note = rest.replace(/^to\s+/i, '').trim()
    return { when, note, phrase }
  }

  /**
   * Run a leading slash command from the composer (Plan §6.3). `/task <text>`
   * creates a task from the text; `/remind <when> <text>` schedules a reminder.
   * Either way a confirmation message is posted to the channel instead of the
   * literal command.
   */
  async runCommand(channelId: string, userId: string, command: string, text: string) {
    const channel = await this.assertChannelAccess(channelId, userId)
    const cmd = (command ?? '').trim().toLowerCase().replace(/^\//, '')
    const trimmed = (text ?? '').trim()

    if (cmd === 'task') {
      if (!trimmed) throw new BadRequestException('Usage: /task <description>')
      const listId = await this.tasks.defaultListFor(channel.workspaceId, userId)
      if (!listId) throw new BadRequestException('No list is available to create a task in yet — create a space, project and list first.')
      const title = trimmed.split('\n')[0].slice(0, 200)
      const task = await this.tasks.createTask({ listId, title, description: trimmed, createdById: userId })
      const message = await this.postMessage({
        channelId,
        authorId: userId,
        body: `✅ **Task created:** ${title}`,
      })
      return { kind: 'task' as const, task, message }
    }

    if (cmd === 'remind') {
      const { when, note, phrase } = this.parseReminderWhen(trimmed)
      if (!note) throw new BadRequestException('Usage: /remind <when> <what> (e.g. /remind in 2 hours review the PR)')
      const title = note.split('\n')[0].slice(0, 200)
      /*
       * §G11 [15:19] — no longer backed by an invented task.
       *
       * It used to create one to hold the text, because `reminders.task_id` was
       * NOT NULL. That put a phantom task in somebody's list for every
       * egg-timer they set, and refused outright in a workspace with no list —
       * an odd prerequisite for "remind me in two hours". The subject is
       * optional now, so the reminder simply carries its own note.
       */
      const reminder = await this.reminders.createStandalone(channel.workspaceId, userId, when, note)
      const message = await this.postMessage({
        channelId,
        authorId: userId,
        body: `⏰ **Reminder set** (${phrase}) — ${title}`,
      })
      return { kind: 'remind' as const, reminder, message }
    }

    // §15 — a skill's slash command. ClickUp: "The /Slash Command for AI Skills
    // appears for everyone in the Workspace", which is the primary way a skill
    // is used: you type it where the work is, not from a settings page.
    //
    // Only skills this person has INSTALLED are reachable. Making every
    // published skill typable would grow the command namespace with the team,
    // collide constantly, and leave "Enabled" describing nothing.
    if (cmd && !isReservedSlug(cmd)) {
      const installed = await this.skills.listInstalled(channel.workspaceId, userId)
      const resolved = resolveSlug(cmd, installed)
      if (resolved.kind === 'ambiguous') {
        throw new BadRequestException(
          `/${cmd} matches more than one of your skills (${resolved.names.join(', ')}). Rename one of them.`,
        )
      }
      if (resolved.kind === 'match') {
        if (!trimmed) throw new BadRequestException(`Usage: /${cmd} <what you want>`)

        // Through SkillsService, so its visibility and enabled checks run on the
        // one path that builds a prompt — a disabled skill is refused here
        // exactly as it is in the AI panel.
        const invocation = await this.skills.buildInvocationContext(
          channel.workspaceId,
          userId,
          resolved.skill.id,
        )
        const skillPrompt = this.skills.renderSkillPrompt(invocation)

        // The question goes in as the person's own message, so the channel
        // reads as a conversation rather than an answer to nothing.
        const asked = await this.postMessage({
          channelId,
          authorId: userId,
          body: `/${cmd} ${trimmed}`,
        })

        const aiUserId = await this.ensureAiUser()
        await this.db
          .insert(chatChannelMembers)
          .values({ channelId: channel.id, userId: aiUserId })
          .onConflictDoNothing()
        const context = await this.ai.buildWorkspaceContext(channel.workspaceId, userId)
        const answer = await this.ai.chatReply(
          [{ role: 'user', content: trimmed }],
          context,
          { userId, workspaceId: channel.workspaceId },
          skillPrompt,
        )
        if (!answer) throw new BadRequestException(`/${cmd} did not come back with an answer`)

        const [aiMsg] = await this.db
          .insert(chatMessages)
          .values({ channelId: channel.id, authorId: aiUserId, body: answer })
          .returning()
        await this.emitToChannel(channel, {
          type: 'chat.message.created',
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          // Named as the skill, not "Rundesk AI": the whole point of invoking
          // one is that this answer came from somewhere specific.
          message: { ...aiMsg, authorName: invocation.skill.name, reactions: [] },
        })
        return { kind: 'skill' as const, skill: resolved.skill, message: asked, reply: aiMsg }
      }
    }

    throw new BadRequestException(`Unknown command: /${cmd}`)
  }

  async editMessage(messageId: string, userId: string, body: string) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    if (existing.deletedAt) throw new ForbiddenException('Cannot edit a deleted message')
    await this.assertChannelAccess(existing.channelId, userId)
    if (existing.authorId !== userId) throw new ForbiddenException('Not your message')
    const now = new Date()
    const trimmed = body.trim()
    // Preserve the prior version (Plan §6.3): snapshot the body being replaced
    // before overwriting it. Skip no-op edits so the history stays meaningful.
    if (trimmed !== existing.body) {
      await this.db
        .insert(chatMessageEdits)
        .values({ messageId, previousBody: existing.body, editedAt: now })
    }
    const [row] = await this.db
      .update(chatMessages)
      .set({ body: trimmed, editedAt: now })
      .where(eq(chatMessages.id, messageId))
      .returning()
    const [channel] = await this.db.select().from(chatChannels).where(eq(chatChannels.id, row.channelId))
    if (channel) {
      await this.emitToChannel(channel, {
        type: 'chat.message.updated',
        workspaceId: channel.workspaceId,
        channelId: row.channelId,
        messageId,
        patch: { body: row.body, editedAt: row.editedAt },
      })
    }
    return row
  }

  /**
   * The edit history of a message (Plan §6.3) — the prior bodies newest-first,
   * plus the message's current body as the live version. Channel-access gated.
   */
  async getMessageEdits(messageId: string, userId: string) {
    const [existing] = await this.db
      .select({ id: chatMessages.id, channelId: chatMessages.channelId, body: chatMessages.body, editedAt: chatMessages.editedAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1)
    if (!existing) throw new NotFoundException('Message not found')
    await this.assertChannelAccess(existing.channelId, userId)
    const edits = await this.db
      .select({ id: chatMessageEdits.id, previousBody: chatMessageEdits.previousBody, editedAt: chatMessageEdits.editedAt })
      .from(chatMessageEdits)
      .where(eq(chatMessageEdits.messageId, messageId))
      .orderBy(desc(chatMessageEdits.editedAt))
    return {
      messageId,
      current: { body: existing.body, editedAt: existing.editedAt },
      edits,
    }
  }

  // Pin / unpin a message for the whole channel (any channel member may pin).
  async setPinned(messageId: string, userId: string, pinned: boolean) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    const channel = await this.assertChannelAccess(existing.channelId, userId)
    const [row] = await this.db
      .update(chatMessages)
      .set({ pinnedAt: pinned ? new Date() : null, pinnedById: pinned ? userId : null })
      .where(eq(chatMessages.id, messageId))
      .returning()
    await this.emitToChannel(channel, {
      type: 'chat.message.updated',
      workspaceId: channel.workspaceId,
      channelId: row.channelId,
      messageId,
      patch: { pinnedAt: row.pinnedAt, pinnedById: row.pinnedById },
    })
    return row
  }

  // List a channel's pinned messages (newest pin first), with pinner attribution.
  async listPinned(channelId: string, userId: string) {
    await this.assertChannelAccess(channelId, userId)
    const rows = await this.db
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        authorId: chatMessages.authorId,
        body: chatMessages.body,
        mentions: chatMessages.mentions,
        editedAt: chatMessages.editedAt,
        pinnedAt: chatMessages.pinnedAt,
        pinnedById: chatMessages.pinnedById,
        createdAt: chatMessages.createdAt,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(
        and(
          eq(chatMessages.channelId, channelId),
          isNotNull(chatMessages.pinnedAt),
          isNull(chatMessages.deletedAt),
        ),
      )
      .orderBy(desc(chatMessages.pinnedAt))
    // Attach the pinner's display name (Plan §6 pin attribution).
    const pinnerIds = [...new Set(rows.map((r) => r.pinnedById).filter((id): id is string => !!id))]
    const pinnerNames = pinnerIds.length
      ? await this.db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, pinnerIds))
      : []
    const nameById = new Map(pinnerNames.map((p) => [p.id, p.name]))
    return rows.map((r) => ({ ...r, pinnedByName: r.pinnedById ? nameById.get(r.pinnedById) ?? null : null }))
  }

  // Save / unsave a message for the current user only (private bookmark).
  // Optional tags (Plan §6.7) are stored on the save row when saving.
  async setSaved(messageId: string, userId: string, saved: boolean, tags?: unknown) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    await this.assertChannelAccess(existing.channelId, userId)
    if (saved) {
      const normalized = normalizeSaveTags(tags)
      await this.db
        .insert(chatMessageSaves)
        .values({ messageId, userId, tags: normalized })
        .onConflictDoUpdate({
          target: [chatMessageSaves.messageId, chatMessageSaves.userId],
          set: { tags: normalized },
        })
      return { messageId, saved, tags: normalized }
    }
    await this.db
      .delete(chatMessageSaves)
      .where(and(eq(chatMessageSaves.messageId, messageId), eq(chatMessageSaves.userId, userId)))
    return { messageId, saved }
  }

  /**
   * §G11 [15:36] — assign a message to somebody as an action item.
   *
   * "aap us ko ASSIGN bhi kar sakte ho." Deliberately *not* a task: creating a
   * task is a different button that already works, and it moves the work away
   * from the conversation that explains it. This asks one person about one line
   * and leaves both where they are.
   *
   * The assignee must be able to read the channel. Assigning a private
   * conversation to somebody who is not in it would notify them with a body
   * quote and a link they cannot open — a leak with a "you can't see this"
   * screen at the end of it.
   */
  async assignMessage(
    messageId: string,
    actorId: string,
    assigneeId: string,
    dueAt?: string | Date | null,
  ) {
    if (!assigneeId) throw new BadRequestException('assigneeId is required')
    const [message] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!message) throw new NotFoundException('Message not found')
    const channel = await this.assertChannelAccess(message.channelId, actorId)
    await this.assertChannelAccess(message.channelId, assigneeId).catch(() => {
      throw new BadRequestException('That person cannot see this conversation')
    })

    let due: Date | null = null
    if (dueAt) {
      due = dueAt instanceof Date ? dueAt : new Date(dueAt)
      if (Number.isNaN(due.getTime())) throw new BadRequestException('dueAt must be a valid date')
    }

    // Pressing Assign on somebody who already has it re-opens it and updates
    // the date, rather than failing on the unique index. "Assign again" is what
    // a person means by pressing it twice, and it is also how a due date is
    // changed without an edit control of its own.
    const [row] = await this.db
      .insert(chatMessageAssignments)
      .values({ messageId, assigneeId, assignedById: actorId, dueAt: due })
      .onConflictDoUpdate({
        target: [chatMessageAssignments.messageId, chatMessageAssignments.assigneeId],
        set: { dueAt: due, assignedById: actorId, resolvedAt: null, resolvedById: null },
      })
      .returning()

    const [assignee] = await this.db
      .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, assigneeId))
    const [actor] = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, actorId))

    // Assigning yourself something is a note to self, not a notification.
    if (assigneeId !== actorId) {
      void this.notifications.create({
        userId: assigneeId,
        workspaceId: channel.workspaceId,
        actorId,
        type: 'message_assigned',
        title: `${actor?.displayName ?? 'A teammate'} assigned you a message in ${channel.isDm ? 'a direct message' : `#${channel.name}`}`,
        body: message.body.slice(0, 180),
        target: {
          entityType: 'chat_message',
          entityId: message.id,
          url: `/app/${channel.workspaceId}/chat?channel=${message.channelId}&message=${message.id}`,
        },
        emailContext: { taskTitle: `#${channel.name}`, commentSnippet: message.body.slice(0, 180) },
      })
    }

    // Everyone in the channel sees the badge appear without a refetch.
    await this.emitToChannel(channel, {
      type: 'chat.message.assigned',
      workspaceId: channel.workspaceId,
      channelId: message.channelId,
      messageId: message.id,
    })

    return {
      ...row,
      assigneeName: assignee?.displayName ?? null,
      assigneeAvatarUrl: assignee?.avatarUrl ?? null,
    }
  }

  /** Take an assignment back off somebody. Idempotent. */
  async unassignMessage(messageId: string, actorId: string, assigneeId: string) {
    const [message] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!message) throw new NotFoundException('Message not found')
    const channel = await this.assertChannelAccess(message.channelId, actorId)
    await this.db
      .delete(chatMessageAssignments)
      .where(
        and(
          eq(chatMessageAssignments.messageId, messageId),
          eq(chatMessageAssignments.assigneeId, assigneeId),
        ),
      )
    await this.emitToChannel(channel, {
      type: 'chat.message.assigned',
      workspaceId: channel.workspaceId,
      channelId: message.channelId,
      messageId: message.id,
    })
    return { messageId, assigneeId, assigned: false }
  }

  /**
   * Mark an assignment done, or re-open it.
   *
   * Resolving stamps rather than deletes: "I did that" and "that was never
   * mine" are different answers, and an assignment that disappears on
   * completion takes the record of who did it with it. Either the assignee or
   * whoever asked can resolve — the assigner watching it land is as common as
   * the assignee reporting it.
   */
  async resolveMessageAssignment(
    messageId: string,
    actorId: string,
    assigneeId: string,
    resolved: boolean,
  ) {
    const [message] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!message) throw new NotFoundException('Message not found')
    const channel = await this.assertChannelAccess(message.channelId, actorId)
    const [row] = await this.db
      .update(chatMessageAssignments)
      .set(
        resolved
          ? { resolvedAt: new Date(), resolvedById: actorId }
          : { resolvedAt: null, resolvedById: null },
      )
      .where(
        and(
          eq(chatMessageAssignments.messageId, messageId),
          eq(chatMessageAssignments.assigneeId, assigneeId),
        ),
      )
      .returning()
    if (!row) throw new NotFoundException('Assignment not found')
    await this.emitToChannel(channel, {
      type: 'chat.message.assigned',
      workspaceId: channel.workspaceId,
      channelId: message.channelId,
      messageId: message.id,
    })
    return row
  }

  /**
   * Everything still assigned to the caller in this workspace, oldest first.
   *
   * Oldest first on purpose: an action item nobody has picked up in a week is
   * the one worth surfacing, and newest-first buries exactly that row.
   */
  async listMyAssignments(workspaceId: string, userId: string) {
    return this.db
      .select({
        id: chatMessageAssignments.id,
        messageId: chatMessageAssignments.messageId,
        channelId: chatMessages.channelId,
        channelName: chatChannels.name,
        isDm: chatChannels.isDm,
        body: chatMessages.body,
        authorId: chatMessages.authorId,
        authorName: users.displayName,
        assignedById: chatMessageAssignments.assignedById,
        dueAt: chatMessageAssignments.dueAt,
        resolvedAt: chatMessageAssignments.resolvedAt,
        createdAt: chatMessageAssignments.createdAt,
      })
      .from(chatMessageAssignments)
      .innerJoin(chatMessages, eq(chatMessages.id, chatMessageAssignments.messageId))
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(
        and(
          eq(chatMessageAssignments.assigneeId, userId),
          eq(chatChannels.workspaceId, workspaceId),
          isNull(chatMessageAssignments.resolvedAt),
        ),
      )
      .orderBy(asc(chatMessageAssignments.createdAt))
  }

  /**
   * §G12 [17:13] — follow or mute one thread.
   *
   * Three states, and `null` is one of them: not having said is different from
   * having said "normal", because what "normal" means depends on whether you
   * ever replied. Clearing the row puts you back on the default rather than
   * freezing today's answer to it.
   */
  async setThreadFollow(
    parentMessageId: string,
    userId: string,
    state: 'following' | 'muted' | null,
  ) {
    const [message] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, parentMessageId))
    if (!message) throw new NotFoundException('Message not found')
    await this.assertChannelAccess(message.channelId, userId)
    // A thread is named by its root. Muting a reply means muting its thread,
    // which is what somebody right-clicking the reply meant.
    const rootId = message.parentMessageId ?? message.id

    if (state === null) {
      await this.db
        .delete(chatThreadFollows)
        .where(
          and(eq(chatThreadFollows.parentMessageId, rootId), eq(chatThreadFollows.userId, userId)),
        )
      return { parentMessageId: rootId, state: null }
    }
    if (state !== 'following' && state !== 'muted') {
      throw new BadRequestException("state must be 'following', 'muted' or null")
    }
    await this.db
      .insert(chatThreadFollows)
      .values({ parentMessageId: rootId, userId, state })
      .onConflictDoUpdate({
        target: [chatThreadFollows.parentMessageId, chatThreadFollows.userId],
        set: { state },
      })
    return { parentMessageId: rootId, state }
  }

  /** The caller's stance on one thread: 'following' | 'muted' | null. */
  async getThreadFollow(parentMessageId: string, userId: string) {
    const [message] = await this.db
      .select({ id: chatMessages.id, channelId: chatMessages.channelId, parentMessageId: chatMessages.parentMessageId })
      .from(chatMessages)
      .where(eq(chatMessages.id, parentMessageId))
    if (!message) throw new NotFoundException('Message not found')
    await this.assertChannelAccess(message.channelId, userId)
    const rootId = message.parentMessageId ?? message.id
    const [row] = await this.db
      .select({ state: chatThreadFollows.state })
      .from(chatThreadFollows)
      .where(and(eq(chatThreadFollows.parentMessageId, rootId), eq(chatThreadFollows.userId, userId)))
      .limit(1)
    return { parentMessageId: rootId, state: row?.state ?? null }
  }

  /**
   * §G11 [15:19] — "Set reminder" on a saved message.
   *
   * The reminder points at the message, so the notification lands you back on
   * the line you wanted to remember rather than on a task invented to hold it.
   */
  async remindAboutMessage(
    messageId: string,
    userId: string,
    remindAt: string | Date,
    note?: string,
  ) {
    const [message] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!message) throw new NotFoundException('Message not found')
    const channel = await this.assertChannelAccess(message.channelId, userId)
    return this.reminders.createForMessage(channel.workspaceId, userId, messageId, remindAt, note)
  }

  /** Replace the tags on an already-saved message (Plan §6.7). */
  async updateSavedTags(messageId: string, userId: string, tags: unknown) {
    const normalized = normalizeSaveTags(tags)
    const [row] = await this.db
      .update(chatMessageSaves)
      .set({ tags: normalized })
      .where(and(eq(chatMessageSaves.messageId, messageId), eq(chatMessageSaves.userId, userId)))
      .returning()
    if (!row) throw new NotFoundException('Saved message not found')
    return { messageId, tags: normalized }
  }

  // List the current user's saved messages across a workspace (newest first),
  // optionally filtered by a tag and/or a free-text query over the body (§6.7).
  async listSaved(workspaceId: string, userId: string, opts: { tag?: string; q?: string } = {}) {
    const conditions = [eq(chatChannels.workspaceId, workspaceId), eq(chatMessageSaves.userId, userId)]
    const tag = opts.tag?.trim().toLowerCase()
    if (tag) conditions.push(sql`${chatMessageSaves.tags} @> ARRAY[${tag}]::text[]`)
    const q = opts.q?.trim()
    if (q) conditions.push(ilike(chatMessages.body, `%${q}%`))
    return this.db
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        channelName: chatChannels.name,
        authorId: chatMessages.authorId,
        body: chatMessages.body,
        mentions: chatMessages.mentions,
        editedAt: chatMessages.editedAt,
        pinnedAt: chatMessages.pinnedAt,
        createdAt: chatMessages.createdAt,
        savedAt: chatMessageSaves.createdAt,
        tags: chatMessageSaves.tags,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(chatMessageSaves)
      .innerJoin(chatMessages, eq(chatMessages.id, chatMessageSaves.messageId))
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(and(...conditions))
      .orderBy(desc(chatMessageSaves.createdAt))
  }

  /**
   * Channel ids in a workspace the requester can actually read (Plan §6.8/§6.11).
   * A bulk equivalent of assertChannelAccess used to scope the file library and
   * message search: excludes channels in a private space the user isn't a member
   * of, and private / DM channels they haven't joined. Archived channels are left
   * out so a search hit always deep-links to a channel still shown in the sidebar.
   */
  private async accessibleChannelIds(workspaceId: string, userId: string): Promise<string[]> {
    const channels = await this.db
      .select({
        id: chatChannels.id,
        spaceId: chatChannels.spaceId,
        isPrivate: chatChannels.isPrivate,
        isDm: chatChannels.isDm,
      })
      .from(chatChannels)
      .where(and(eq(chatChannels.workspaceId, workspaceId), isNull(chatChannels.archivedAt)))
    if (channels.length === 0) return []

    const memberships = await this.db
      .select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.userId, userId))
    const memberSet = new Set(memberships.map((m) => m.channelId))

    // Private spaces the user is NOT a member of block every channel scoped to them.
    const blockedSpaceIds = new Set<string>()
    const spaceIds = [...new Set(channels.map((c) => c.spaceId).filter((id): id is string => !!id))]
    if (spaceIds.length > 0) {
      const spaceRows = await this.db
        .select({ id: spaces.id, visibility: spaces.visibility })
        .from(spaces)
        .where(inArray(spaces.id, spaceIds))
      const privateSpaceIds = spaceRows.filter((s) => s.visibility === 'private').map((s) => s.id)
      if (privateSpaceIds.length > 0) {
        const mine = await this.db
          .select({ spaceId: spaceMembers.spaceId })
          .from(spaceMembers)
          .where(and(eq(spaceMembers.userId, userId), inArray(spaceMembers.spaceId, privateSpaceIds)))
        const mineSet = new Set(mine.map((m) => m.spaceId))
        for (const id of privateSpaceIds) if (!mineSet.has(id)) blockedSpaceIds.add(id)
      }
    }

    return channels
      .filter((c) => {
        if (c.spaceId && blockedSpaceIds.has(c.spaceId)) return false
        if ((c.isPrivate || c.isDm) && !memberSet.has(c.id)) return false
        return true
      })
      .map((c) => c.id)
  }

  /** Escape LIKE wildcards so a user's query is matched literally. */
  private escapeLike(input: string): string {
    return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  }

  /**
   * Translate a coarse file-type filter (Plan §6.8/§6.11) into a content-type
   * ILIKE pattern. 'image' | 'video' | 'audio' → the MIME top-level; 'pdf' → any
   * pdf; anything else is a literal content-type substring. Null means "no type
   * constraint" (empty / any / all).
   */
  private contentTypePattern(type?: string): string | null {
    const t = (type ?? '').trim().toLowerCase()
    if (!t || t === 'any' || t === 'all') return null
    if (t === 'image' || t === 'video' || t === 'audio') return `${t}/%`
    if (t === 'pdf') return '%pdf%'
    return `%${this.escapeLike(t)}%`
  }

  /**
   * Workspace file library (Plan §6.8): every attachment posted in a channel the
   * user can read, newest first, with a fresh signed download URL. Optional
   * filename search (`q`), coarse content-type filter (`type`) and channel scope
   * (`channelId`, §A3.7 — the panel opens on the channel you're reading).
   * Attachments on unsent drafts (message_id null) or deleted messages are
   * excluded.
   */
  async listWorkspaceFiles(
    workspaceId: string,
    userId: string,
    opts: { q?: string; type?: string; channelId?: string } = {},
  ) {
    let channelIds = await this.accessibleChannelIds(workspaceId, userId)
    if (opts.channelId) channelIds = channelIds.filter((id) => id === opts.channelId)
    if (channelIds.length === 0) return []

    const conds = [
      inArray(chatMessageAttachments.channelId, channelIds),
      isNotNull(chatMessageAttachments.messageId),
      isNull(chatMessages.deletedAt),
    ]
    const q = (opts.q ?? '').trim()
    if (q) conds.push(ilike(chatMessageAttachments.fileName, `%${this.escapeLike(q)}%`))
    const typePattern = this.contentTypePattern(opts.type)
    if (typePattern) conds.push(ilike(chatMessageAttachments.contentType, typePattern))

    const rows = await this.db
      .select({
        id: chatMessageAttachments.id,
        fileName: chatMessageAttachments.fileName,
        contentType: chatMessageAttachments.contentType,
        sizeBytes: chatMessageAttachments.sizeBytes,
        storageKey: chatMessageAttachments.storageKey,
        createdAt: chatMessageAttachments.createdAt,
        channelId: chatMessageAttachments.channelId,
        channelName: chatChannels.name,
        messageId: chatMessageAttachments.messageId,
        uploadedById: chatMessageAttachments.uploadedById,
        uploaderName: users.displayName,
      })
      .from(chatMessageAttachments)
      .innerJoin(chatMessages, eq(chatMessages.id, chatMessageAttachments.messageId))
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessageAttachments.channelId))
      .leftJoin(users, eq(users.id, chatMessageAttachments.uploadedById))
      .where(and(...conds))
      .orderBy(desc(chatMessageAttachments.createdAt))
      .limit(200)

    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        fileName: r.fileName,
        contentType: r.contentType,
        sizeBytes: r.sizeBytes,
        channelId: r.channelId,
        channelName: r.channelName,
        messageId: r.messageId,
        uploadedById: r.uploadedById,
        uploaderName: r.uploaderName ?? null,
        createdAt: r.createdAt,
        url: await this.chatAttachmentUrl(r),
      })),
    )
  }

  /**
   * Full message search across the workspace (Plan §6.11). Searches message
   * bodies (thread replies included) in every channel the user can read, with
   * optional channel / sender / date-range / has-file(type) filters. Each hit
   * carries channelId + messageId so the client can deep-link + highlight.
   */
  async searchMessages(
    workspaceId: string,
    userId: string,
    opts: { q?: string; channelId?: string; senderId?: string; after?: string; before?: string; fileType?: string } = {},
  ) {
    let channelIds = await this.accessibleChannelIds(workspaceId, userId)
    if (opts.channelId) channelIds = channelIds.filter((id) => id === opts.channelId)
    if (channelIds.length === 0) return []

    const conds = [inArray(chatMessages.channelId, channelIds), isNull(chatMessages.deletedAt)]
    const q = (opts.q ?? '').trim()
    if (q) conds.push(ilike(chatMessages.body, `%${this.escapeLike(q)}%`))
    if (opts.senderId) conds.push(eq(chatMessages.authorId, opts.senderId))
    const after = opts.after ? new Date(opts.after) : null
    if (after && !Number.isNaN(after.getTime())) conds.push(gt(chatMessages.createdAt, after))
    const before = opts.before ? new Date(opts.before) : null
    if (before && !Number.isNaN(before.getTime())) conds.push(lt(chatMessages.createdAt, before))
    // has-file(type): correlated EXISTS so a message matches when it carries at
    // least one attachment (optionally of the requested content-type family).
    const fileType = (opts.fileType ?? '').trim().toLowerCase()
    if (fileType) {
      const filePattern = this.contentTypePattern(opts.fileType)
      const typeFrag = filePattern ? sql` and cma.content_type ilike ${filePattern}` : sql``
      conds.push(
        sql`exists (select 1 from chat_message_attachments cma where cma.message_id = ${chatMessages.id}${typeFrag})`,
      )
    }

    return this.db
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        channelName: chatChannels.name,
        parentMessageId: chatMessages.parentMessageId,
        authorId: chatMessages.authorId,
        authorName: users.displayName,
        body: chatMessages.body,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(and(...conds))
      .orderBy(desc(chatMessages.createdAt))
      .limit(50)
  }

  /** Channel creator or a workspace admin/super_admin may moderate (Plan §6). */
  private async canModerateChannel(
    channel: { createdById: string | null; workspaceId: string },
    userId: string,
  ): Promise<boolean> {
    if (channel.createdById === userId) return true
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, channel.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return m?.role === 'workspace_admin' || m?.role === 'super_admin'
  }

  async deleteMessage(messageId: string, userId: string) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    const channel = await this.assertChannelAccess(existing.channelId, userId)
    if (existing.authorId !== userId && !(await this.canModerateChannel(channel, userId))) {
      throw new ForbiddenException('Only the author or a channel/workspace admin can delete this message')
    }
    // Soft-delete tombstone: keep the row (threads/pins), blank the body, unpin.
    const [row] = await this.db
      .update(chatMessages)
      .set({ deletedAt: new Date(), body: '', pinnedAt: null, pinnedById: null })
      .where(eq(chatMessages.id, messageId))
      .returning()
    await this.emitToChannel(channel, {
      type: 'chat.message.updated',
      workspaceId: channel.workspaceId,
      channelId: existing.channelId,
      messageId,
      patch: { deletedAt: row.deletedAt, body: '', pinnedAt: null },
    })
    return { ok: true }
  }

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const [message] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!message) throw new NotFoundException('Message not found')
    await this.assertChannelAccess(message.channelId, userId)
    const [channel] = message
      ? await this.db.select().from(chatChannels).where(eq(chatChannels.id, message.channelId))
      : []
    const [existing] = await this.db
      .select()
      .from(chatMessageReactions)
      .where(
        and(
          eq(chatMessageReactions.messageId, messageId),
          eq(chatMessageReactions.userId, userId),
          eq(chatMessageReactions.emoji, emoji),
        ),
      )
    if (existing) {
      await this.db.delete(chatMessageReactions).where(eq(chatMessageReactions.id, existing.id))
      if (channel && message) {
        await this.emitToChannel(channel, {
          type: 'chat.reaction.toggled',
          workspaceId: channel.workspaceId,
          channelId: message.channelId,
          messageId,
        })
      }
      return { ok: true, removed: true }
    }
    await this.db.insert(chatMessageReactions).values({ messageId, userId, emoji })
    if (channel && message) {
      await this.emitToChannel(channel, {
        type: 'chat.reaction.toggled',
        workspaceId: channel.workspaceId,
        channelId: message.channelId,
        messageId,
      })
      // §2.2 — one of the kinds she went through in the Primary customiser.
      // She turns it off for herself ("neeche se REACTIONS mujhe na show hon"),
      // which is a choice the picker can only offer if the type exists.
      // Reacting to your own message tells you nothing.
      if (message.authorId && message.authorId !== userId) {
        await this.notifications
          .create({
            userId: message.authorId,
            workspaceId: channel.workspaceId,
            actorId: userId,
            type: 'message_reaction',
            title: emoji,
            body: message.body ?? undefined,
            target: { entityType: 'chat_message', entityId: messageId },
          })
          .catch(() => undefined)
      }
    }
    return { ok: true, added: true }
  }

  async ensureGeneralChannel(workspaceId: string, userId: string) {
    const existing = await this.db
      .select()
      .from(chatChannels)
      .where(and(eq(chatChannels.workspaceId, workspaceId), eq(chatChannels.name, 'general')))
    if (existing.length > 0) return existing[0]
    // A guest makes no channel, #general included: listing the channels as one
    // leaves the workspace without it until a member lists them.
    const [caller] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (caller?.role === 'guest') return null
    return this.createChannel({ workspaceId, name: 'general', createdById: userId })
  }

  /**
   * Fetch Open-Graph / Twitter-card metadata for a pasted link so the client can
   * render an inline preview (Plan §6.3). SSRF-hardened and best-effort: any
   * disallowed URL, timeout, or fetch error resolves to `{}` — we never throw to
   * the client and never surface an internal error. Results (including empty
   * ones, to avoid hammering a bad URL) are cached briefly in memory.
   */
  async unfurl(rawUrl: unknown): Promise<UnfurlResult> {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
    if (!url) return {}

    const now = Date.now()
    const hit = this.unfurlCache.get(url)
    if (hit && now - hit.at < UNFURL_CACHE_TTL_MS) return hit.value

    let value: UnfurlResult
    try {
      value = await fetchLinkPreview(url)
    } catch {
      value = {}
    }

    // Cheap size bound: clear when the map grows past the cap rather than track LRU.
    if (this.unfurlCache.size >= UNFURL_CACHE_MAX_ENTRIES) this.unfurlCache.clear()
    this.unfurlCache.set(url, { at: now, value })
    return value
  }
}
