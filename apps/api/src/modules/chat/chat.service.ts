import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, desc, asc, isNull, or } from 'drizzle-orm'
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  chatMessageReactions,
  workspaceMembers,
  users,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class ChatService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
  ) {}

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
    const visible = rows
      .filter((c) => !c.isPrivate || memberSet.has(c.id))
      .map((c) => ({ ...c, joined: memberSet.has(c.id) }))

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

    this.realtime.emitToWorkspace(channel.workspaceId, {
      type: 'chat.message.created',
      workspaceId: channel.workspaceId,
      channelId: data.channelId,
      message: enriched,
    })

    if (mentionIds.size > 0) {
      const memberRows = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, channel.workspaceId))
      const workspaceMemberIds = new Set(memberRows.map((m) => m.userId))

      for (const userId of mentionIds) {
        if (userId === data.authorId) continue
        if (!workspaceMemberIds.has(userId)) continue
        void this.notifications.create({
          userId,
          workspaceId: channel.workspaceId,
          actorId: data.authorId,
          type: 'task_mentioned',
          title: `You were mentioned in #${channel.name}`,
          body: body.slice(0, 180),
          target: { entityType: 'chat_message', entityId: row.id, url: `/app/${channel.workspaceId}/chat` },
          emailContext: { taskTitle: `#${channel.name}`, workspaceName: 'Workspace' },
        })
      }
    }

    return enriched
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
