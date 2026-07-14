import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, desc, asc, isNull, isNotNull, or, ne, gt, sql, inArray } from 'drizzle-orm'
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  chatMessageReactions,
  chatMessageSaves,
  workspaceMembers,
  users,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { NotificationsService } from '../notifications/notifications.service'
import { TasksService } from '../tasks/tasks.service'
import { AiService } from '../ai/ai.service'

const AI_USER_EMAIL = 'ai-assistant@rundesk.system'

@Injectable()
export class ChatService {
  private aiUserId: string | null = null

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
    private tasks: TasksService,
    private ai: AiService,
  ) {}

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
  private async maybeAnswerAiMention(channel: { id: string; workspaceId: string }, authorId: string, body: string) {
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
      this.realtime.emitToWorkspace(channel.workspaceId, {
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

  private async assertChannelAccess(channelId: string, userId: string) {
    const [channel] = await this.db.select().from(chatChannels).where(eq(chatChannels.id, channelId)).limit(1)
    if (!channel) throw new NotFoundException('Channel not found')

    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, channel.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!membership) throw new ForbiddenException('Workspace membership required')

    if (channel.isPrivate || channel.isDm) {
      const [channelMembership] = await this.db
        .select({ userId: chatChannelMembers.userId })
        .from(chatChannelMembers)
        .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
        .limit(1)
      if (!channelMembership) throw new ForbiddenException('Channel membership required')
    }

    return channel
  }

  async listChannels(workspaceId: string, userId: string) {
    const rows = await this.db
      .select({
        id: chatChannels.id,
        name: chatChannels.name,
        description: chatChannels.description,
        isPrivate: chatChannels.isPrivate,
        isDm: chatChannels.isDm,
        createdAt: chatChannels.createdAt,
      })
      .from(chatChannels)
      .where(and(eq(chatChannels.workspaceId, workspaceId), isNull(chatChannels.archivedAt)))
      .orderBy(asc(chatChannels.createdAt))

    const memberships = await this.db
      .select()
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.userId, userId))

    const memberSet = new Set(memberships.map((m) => m.channelId))
    const lastReadMap = new Map(memberships.map((m) => [m.channelId, m.lastReadAt]))
    const levelMap = new Map(memberships.map((m) => [m.channelId, m.notificationLevel]))

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

    const visible = rows
      .filter((c) => !c.isPrivate || memberSet.has(c.id))
      .map((c) => ({
        ...c,
        joined: memberSet.has(c.id),
        unreadCount: unreadMap.get(c.id) ?? 0,
        lastReadAt: lastReadMap.get(c.id) ?? null,
        notificationLevel: levelMap.get(c.id) ?? 'all',
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
      const peer = members.find((m) => m.channelId === channel.id && m.userId !== userId)
      return {
        ...channel,
        dmPeerId: peer?.userId,
        dmPeerName: peer?.displayName ?? null,
        dmPeerAvatarUrl: peer?.avatarUrl ?? null,
      }
    })
  }

  /** Mark a channel read up to now for the user (upserts their member row). */
  async markChannelRead(channelId: string, userId: string) {
    await this.assertChannelAccess(channelId, userId)
    const now = new Date()
    await this.db
      .insert(chatChannelMembers)
      .values({ channelId, userId, lastReadAt: now })
      .onConflictDoUpdate({
        target: [chatChannelMembers.channelId, chatChannelMembers.userId],
        set: { lastReadAt: now },
      })
    return { ok: true, lastReadAt: now }
  }

  /** Set the caller's notification level for a channel ('all' | 'mentions' | 'none'). */
  async setChannelNotificationLevel(channelId: string, userId: string, level: string) {
    if (!['all', 'mentions', 'none'].includes(level)) {
      throw new ForbiddenException("level must be 'all', 'mentions', or 'none'")
    }
    await this.assertChannelAccess(channelId, userId)
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

    this.realtime.emitToWorkspace(workspaceId, {
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
    isPrivate?: boolean
    createdById: string
    memberIds?: string[]
  }) {
    const name = data.name.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-')
    if (!name) throw new ForbiddenException('Channel name required')
    const [row] = await this.db
      .insert(chatChannels)
      .values({
        workspaceId: data.workspaceId,
        name,
        description: data.description,
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
    this.realtime.emitToWorkspace(data.workspaceId, {
      type: 'chat.channel.created',
      workspaceId: data.workspaceId,
      channel: row,
    })
    return row
  }

  async joinChannel(channelId: string, userId: string) {
    await this.assertChannelAccess(channelId, userId)
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

  async leaveChannel(channelId: string, userId: string) {
    await this.assertChannelAccess(channelId, userId)
    await this.db
      .delete(chatChannelMembers)
      .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    return { ok: true }
  }

  async listMessages(channelId: string, userId: string, opts: { limit?: number; before?: string } = {}) {
    await this.assertChannelAccess(channelId, userId)
    const limit = Math.min(opts.limit ?? 50, 200)
    const where = opts.before
      ? and(eq(chatMessages.channelId, channelId), isNull(chatMessages.parentMessageId))
      : and(eq(chatMessages.channelId, channelId), isNull(chatMessages.parentMessageId))
    const rows = await this.db
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        authorId: chatMessages.authorId,
        body: chatMessages.body,
        mentions: chatMessages.mentions,
        editedAt: chatMessages.editedAt,
        pinnedAt: chatMessages.pinnedAt,
        createdAt: chatMessages.createdAt,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(where)
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
    const ordered = rows.reverse()
    if (ordered.length === 0) return ordered

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

    return ordered.map((message) => {
      const byEmoji = grouped.get(message.id)
      const reactions =
        byEmoji
          ? [...byEmoji.entries()].map(([emoji, users]) => ({
              emoji,
              count: users.size,
              reacted: users.has(userId),
            }))
          : []
      return { ...message, reactions }
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
      .where(and(eq(chatChannels.workspaceId, workspaceId), eq(chatMessages.authorId, memberUserId)))
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
    const reactions = [...grouped.entries()].map(([emoji, usersForEmoji]) => ({
      emoji,
      count: usersForEmoji.size,
      reacted: usersForEmoji.has(userId),
    }))

    return { ...row, reactions }
  }

  async getThread(messageId: string, userId: string, limit = 100) {
    const parent = await this.getMessageById(messageId, userId)
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
      .where(eq(chatMessages.parentMessageId, parent.id))
      .orderBy(asc(chatMessages.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200))

    return { parent, replies: rows }
  }

  async postMessage(data: {
    channelId: string
    authorId: string
    body: string
    parentMessageId?: string | null
    mentions?: Array<{ userId: string; offset?: number; length?: number }>
  }) {
    await this.assertChannelAccess(data.channelId, data.authorId)
    const body = data.body.trim()
    if (!body) throw new ForbiddenException('Message body required')
    const [channel] = await this.db.select().from(chatChannels).where(eq(chatChannels.id, data.channelId))
    if (!channel) throw new NotFoundException('Channel not found')

    const parsedMentionIds = this.extractMentionIds(body)
    const mentionIds = new Set([
      ...(data.mentions ?? []).map((m) => m.userId),
      ...parsedMentionIds,
    ])
    const normalizedMentions = [...mentionIds].map((userId) => ({ userId, offset: 0, length: 0 }))

    const [row] = await this.db
      .insert(chatMessages)
      .values({
        channelId: data.channelId,
        authorId: data.authorId,
        body,
        parentMessageId: data.parentMessageId ?? null,
        mentions: normalizedMentions.length > 0 ? normalizedMentions : null,
      })
      .returning()

    const [author] = await this.db.select({ displayName: users.displayName, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, data.authorId))
    const enriched = { ...row, authorName: author?.displayName, authorAvatarUrl: author?.avatarUrl, reactions: [] as Array<{ emoji: string; count: number; reacted: boolean }> }

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

    this.realtime.emitToWorkspace(channel.workspaceId, {
      type: 'chat.message.created',
      workspaceId: channel.workspaceId,
      channelId: data.channelId,
      message: enriched,
    })

    // Per-channel notification levels: 'all' (default) hears every message,
    // 'mentions' only @-mentions, 'none' is muted.
    const levelRows = await this.db
      .select({ userId: chatChannelMembers.userId, level: chatChannelMembers.notificationLevel })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.channelId, data.channelId))
    const levelByUser = new Map(levelRows.map((r) => [r.userId, r.level]))

    if (mentionIds.size > 0) {
      const memberRows = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, channel.workspaceId))
      const workspaceMemberIds = new Set(memberRows.map((m) => m.userId))

      for (const userId of mentionIds) {
        if (userId === data.authorId) continue
        if (!workspaceMemberIds.has(userId)) continue
        // Muted members don't get pinged even on @mention.
        if ((levelByUser.get(userId) ?? 'all') === 'none') continue
        void this.notifications.create({
          userId,
          workspaceId: channel.workspaceId,
          actorId: data.authorId,
          type: 'task_mentioned',
          title: channel.isDm ? `You were mentioned by ${author?.displayName ?? 'a teammate'}` : `You were mentioned in ${channelLabel}`,
          body: body.slice(0, 180),
          target: { entityType: 'chat_message', entityId: row.id, url: `/app/${channel.workspaceId}/chat` },
          emailContext: { taskTitle: channelLabel, workspaceName: 'Workspace' },
        })
      }
    }

    // Notify channel members about new messages (except author and already-mentioned users).
    const memberRows = await this.db
      .select({ userId: chatChannelMembers.userId })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.channelId, data.channelId))
    const notifiedIds = new Set([...mentionIds, data.authorId])
    for (const { userId } of memberRows) {
      if (notifiedIds.has(userId)) continue
      // Only 'all' members hear non-mention messages; 'mentions'/'none' opt out.
      if ((levelByUser.get(userId) ?? 'all') !== 'all') continue
      void this.notifications.create({
        userId,
        workspaceId: channel.workspaceId,
        actorId: data.authorId,
        type: 'chat_message',
        title: channel.isDm ? `New message from ${author?.displayName ?? 'a teammate'}` : `New message in ${channelLabel}`,
        body: body.slice(0, 180),
        target: { entityType: 'chat_message', entityId: row.id, url: `/app/${channel.workspaceId}/chat` },
        emailContext: { taskTitle: channelLabel, workspaceName: 'Workspace', commentSnippet: body.slice(0, 180) },
      })
    }

    // @Rundesk AI assistant (§7.6) — best-effort, fire-and-forget.
    void this.maybeAnswerAiMention({ id: channel.id, workspaceId: channel.workspaceId }, data.authorId, body)

    return enriched
  }

  /**
   * Create a task from a chat message (Plan §6.10). Title defaults to the
   * message's first line; the full message becomes the description.
   */
  async createTaskFromMessage(messageId: string, userId: string, listId: string, title?: string) {
    const [message] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!message) throw new NotFoundException('Message not found')
    await this.assertChannelAccess(message.channelId, userId)
    if (!listId) throw new ForbiddenException('listId is required')

    const firstLine = message.body.split('\n')[0].trim()
    const resolvedTitle = (title?.trim() || firstLine || 'Task from chat').slice(0, 200)
    const task = await this.tasks.createTask({
      listId,
      title: resolvedTitle,
      description: message.body,
      createdById: userId,
    })
    return task
  }

  async editMessage(messageId: string, userId: string, body: string) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    await this.assertChannelAccess(existing.channelId, userId)
    if (existing.authorId !== userId) throw new ForbiddenException('Not your message')
    const [row] = await this.db
      .update(chatMessages)
      .set({ body: body.trim(), editedAt: new Date() })
      .where(eq(chatMessages.id, messageId))
      .returning()
    const [channel] = await this.db.select().from(chatChannels).where(eq(chatChannels.id, row.channelId))
    if (channel) {
      this.realtime.emitToWorkspace(channel.workspaceId, {
        type: 'chat.message.updated',
        workspaceId: channel.workspaceId,
        channelId: row.channelId,
        messageId,
        patch: { body: row.body, editedAt: row.editedAt },
      })
    }
    return row
  }

  // Pin / unpin a message for the whole channel (any channel member may pin).
  async setPinned(messageId: string, userId: string, pinned: boolean) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    const channel = await this.assertChannelAccess(existing.channelId, userId)
    const [row] = await this.db
      .update(chatMessages)
      .set({ pinnedAt: pinned ? new Date() : null })
      .where(eq(chatMessages.id, messageId))
      .returning()
    this.realtime.emitToWorkspace(channel.workspaceId, {
      type: 'chat.message.updated',
      workspaceId: channel.workspaceId,
      channelId: row.channelId,
      messageId,
      patch: { pinnedAt: row.pinnedAt },
    })
    return row
  }

  // List a channel's pinned messages (newest pin first).
  async listPinned(channelId: string, userId: string) {
    await this.assertChannelAccess(channelId, userId)
    return this.db
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        authorId: chatMessages.authorId,
        body: chatMessages.body,
        mentions: chatMessages.mentions,
        editedAt: chatMessages.editedAt,
        pinnedAt: chatMessages.pinnedAt,
        createdAt: chatMessages.createdAt,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(and(eq(chatMessages.channelId, channelId), isNotNull(chatMessages.pinnedAt)))
      .orderBy(desc(chatMessages.pinnedAt))
  }

  // Save / unsave a message for the current user only (private bookmark).
  async setSaved(messageId: string, userId: string, saved: boolean) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    await this.assertChannelAccess(existing.channelId, userId)
    if (saved) {
      await this.db.insert(chatMessageSaves).values({ messageId, userId }).onConflictDoNothing()
    } else {
      await this.db
        .delete(chatMessageSaves)
        .where(and(eq(chatMessageSaves.messageId, messageId), eq(chatMessageSaves.userId, userId)))
    }
    return { messageId, saved }
  }

  // List the current user's saved messages across a workspace (newest first).
  async listSaved(workspaceId: string, userId: string) {
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
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(chatMessageSaves)
      .innerJoin(chatMessages, eq(chatMessages.id, chatMessageSaves.messageId))
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(and(eq(chatChannels.workspaceId, workspaceId), eq(chatMessageSaves.userId, userId)))
      .orderBy(desc(chatMessageSaves.createdAt))
  }

  async deleteMessage(messageId: string, userId: string) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    await this.assertChannelAccess(existing.channelId, userId)
    if (existing.authorId !== userId) throw new ForbiddenException('Not your message')
    const [channel] = await this.db.select().from(chatChannels).where(eq(chatChannels.id, existing.channelId))
    await this.db.delete(chatMessages).where(eq(chatMessages.id, messageId))
    if (channel) {
      this.realtime.emitToWorkspace(channel.workspaceId, {
        type: 'chat.message.deleted',
        workspaceId: channel.workspaceId,
        channelId: existing.channelId,
        messageId,
      })
    }
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
        this.realtime.emitToWorkspace(channel.workspaceId, {
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
      this.realtime.emitToWorkspace(channel.workspaceId, {
        type: 'chat.reaction.toggled',
        workspaceId: channel.workspaceId,
        channelId: message.channelId,
        messageId,
      })
    }
    return { ok: true, added: true }
  }

  async ensureGeneralChannel(workspaceId: string, userId: string) {
    const existing = await this.db
      .select()
      .from(chatChannels)
      .where(and(eq(chatChannels.workspaceId, workspaceId), eq(chatChannels.name, 'general')))
    if (existing.length > 0) return existing[0]
    return this.createChannel({ workspaceId, name: 'general', createdById: userId })
  }
}
