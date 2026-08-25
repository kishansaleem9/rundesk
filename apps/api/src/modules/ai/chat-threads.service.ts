import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { aiChatMessages, aiChatThreads } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { AiService } from './ai.service'
import {
  DEFAULT_THREAD_TITLE,
  cleanTitle,
  fallbackTitle,
  shouldAutoTitle,
} from './chat-thread-title'

/**
 * §15 — AI chats that outlive the panel, and name themselves.
 *
 * Frames `296_1817` → `297_1820` → `304_1907`: "New Chat" becomes "Skill
 * Definition and Ideas" and is still in the sidebar after the panel closes.
 *
 * A thread belongs to one person. These are working notes, often half-formed —
 * making them workspace-visible would publish thinking nobody chose to share.
 */
@Injectable()
export class ChatThreadsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private ai: AiService,
  ) {}

  list(workspaceId: string, userId: string) {
    return this.db
      .select({
        id: aiChatThreads.id,
        title: aiChatThreads.title,
        skillId: aiChatThreads.skillId,
        updatedAt: aiChatThreads.updatedAt,
        /**
         * Written out rather than interpolated. Inside a `.select({})`
         * projection drizzle renders a column reference UNQUALIFIED, so
         * `${aiChatMessages.threadId} = ${aiChatThreads.id}` came out as
         * `where "thread_id" = "id"` — a message's own two columns compared to
         * each other. It matches nothing, returns 0 for every thread, and
         * raises no error at all. Caught by the count check against real
         * Postgres; nothing about the TypeScript looked wrong.
         */
        messageCount: sql<number>`(
          select count(*)::int from "ai_chat_messages"
          where "ai_chat_messages"."thread_id" = "ai_chat_threads"."id"
        )`,
      })
      .from(aiChatThreads)
      .where(and(eq(aiChatThreads.workspaceId, workspaceId), eq(aiChatThreads.userId, userId)))
      .orderBy(desc(aiChatThreads.updatedAt))
      .limit(50)
  }

  /**
   * 404 rather than 403 on someone else's thread — the same rule as skills, and
   * for the same reason: a 403 confirms the id names a real conversation.
   */
  private async own(workspaceId: string, userId: string, threadId: string) {
    const [row] = await this.db
      .select()
      .from(aiChatThreads)
      .where(and(eq(aiChatThreads.id, threadId), eq(aiChatThreads.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Chat not found')
    if (row.userId !== userId) throw new NotFoundException('Chat not found')
    return row
  }

  async get(workspaceId: string, userId: string, threadId: string) {
    const thread = await this.own(workspaceId, userId, threadId)
    const messages = await this.db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.threadId, threadId))
      .orderBy(asc(aiChatMessages.createdAt))
    return { ...thread, messages }
  }

  async create(workspaceId: string, userId: string, skillId?: string) {
    const [row] = await this.db
      .insert(aiChatThreads)
      .values({ workspaceId, userId, skillId: skillId ?? null })
      .returning()
    return row
  }

  /**
   * Append a turn, then name the thread if this is the exchange that made it
   * about something.
   *
   * Naming is best-effort and deliberately never fails the append: losing the
   * message because the title could not be generated would trade the thing
   * being stored for the label on it.
   */
  async append(
    workspaceId: string,
    userId: string,
    threadId: string,
    turn: { role: 'user' | 'assistant'; content: string },
  ) {
    const thread = await this.own(workspaceId, userId, threadId)
    const [message] = await this.db
      .insert(aiChatMessages)
      .values({ threadId, role: turn.role, content: turn.content })
      .returning()
    await this.db
      .update(aiChatThreads)
      .set({ updatedAt: new Date() })
      .where(eq(aiChatThreads.id, threadId))

    const title = await this.maybeTitle(thread, threadId, workspaceId, userId).catch(
      () => undefined,
    )
    return { message, title }
  }

  private async maybeTitle(
    thread: { title: string; titleIsAuto: 'yes' | 'no' },
    threadId: string,
    workspaceId: string,
    userId: string,
  ): Promise<string | undefined> {
    const rows = await this.db
      .select({ role: aiChatMessages.role, content: aiChatMessages.content })
      .from(aiChatMessages)
      .where(eq(aiChatMessages.threadId, threadId))
      .orderBy(asc(aiChatMessages.createdAt))
      .limit(6)
    if (!shouldAutoTitle({ ...thread, messageCount: rows.length })) return undefined

    const firstAsked = rows.find((r) => r.role === 'user')?.content ?? ''
    const title = cleanTitle(await this.ai.titleForChat(rows, { userId, workspaceId })) ||
      fallbackTitle(firstAsked)
    if (!title || title === DEFAULT_THREAD_TITLE) return undefined

    await this.db
      .update(aiChatThreads)
      .set({ title })
      .where(eq(aiChatThreads.id, threadId))
    return title
  }

  /** A person renaming their own thread turns the automatic naming off for good. */
  async rename(workspaceId: string, userId: string, threadId: string, title: string) {
    await this.own(workspaceId, userId, threadId)
    const trimmed = cleanTitle(title)
    if (!trimmed) throw new ForbiddenException('A chat needs a name')
    const [row] = await this.db
      .update(aiChatThreads)
      .set({ title: trimmed, titleIsAuto: 'no' })
      .where(eq(aiChatThreads.id, threadId))
      .returning()
    return row
  }

  async remove(workspaceId: string, userId: string, threadId: string) {
    await this.own(workspaceId, userId, threadId)
    await this.db.delete(aiChatThreads).where(eq(aiChatThreads.id, threadId))
    return { ok: true }
  }
}
