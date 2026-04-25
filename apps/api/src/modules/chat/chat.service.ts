import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, desc, asc, isNull, or } from 'drizzle-orm'
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  chatMessageReactions,
  users,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'

@Injectable()
export class ChatService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
  ) {}

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
    return rows
      .filter((c) => !c.isPrivate || memberSet.has(c.id))
      .map((c) => ({ ...c, joined: memberSet.has(c.id) }))
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
      type: 'doc.updated',
      docId: row.id,
      patch: { chat: 'channel.created' },
    })
    return row
  }

  async joinChannel(channelId: string, userId: string) {
    await this.db
      .insert(chatChannelMembers)
      .values({ channelId, userId })
      .onConflictDoNothing()
    return { ok: true }
  }

  async leaveChannel(channelId: string, userId: string) {
    await this.db
      .delete(chatChannelMembers)
      .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    return { ok: true }
  }

  async listMessages(channelId: string, opts: { limit?: number; before?: string } = {}) {
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
    return rows.reverse()
  }

  async postMessage(data: {
    channelId: string
    authorId: string
    body: string
    parentMessageId?: string | null
  }) {
    const body = data.body.trim()
    if (!body) throw new ForbiddenException('Message body required')
    const [channel] = await this.db.select().from(chatChannels).where(eq(chatChannels.id, data.channelId))
    if (!channel) throw new NotFoundException('Channel not found')

    const [row] = await this.db
      .insert(chatMessages)
      .values({
        channelId: data.channelId,
        authorId: data.authorId,
        body,
        parentMessageId: data.parentMessageId ?? null,
      })
      .returning()

    const [author] = await this.db.select({ displayName: users.displayName, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, data.authorId))
    const enriched = { ...row, authorName: author?.displayName, authorAvatarUrl: author?.avatarUrl }

    this.realtime.emitToWorkspace(channel.workspaceId, {
      type: 'doc.updated',
      docId: data.channelId,
      patch: { chat: 'message.created', message: enriched },
    })

    return enriched
  }

  async editMessage(messageId: string, userId: string, body: string) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    if (existing.authorId !== userId) throw new ForbiddenException('Not your message')
    const [row] = await this.db
      .update(chatMessages)
      .set({ body: body.trim(), editedAt: new Date() })
      .where(eq(chatMessages.id, messageId))
      .returning()
    return row
  }

  async deleteMessage(messageId: string, userId: string) {
    const [existing] = await this.db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!existing) throw new NotFoundException('Message not found')
    if (existing.authorId !== userId) throw new ForbiddenException('Not your message')
    await this.db.delete(chatMessages).where(eq(chatMessages.id, messageId))
    return { ok: true }
  }

  async toggleReaction(messageId: string, userId: string, emoji: string) {
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
      return { ok: true, removed: true }
    }
    await this.db.insert(chatMessageReactions).values({ messageId, userId, emoji })
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
