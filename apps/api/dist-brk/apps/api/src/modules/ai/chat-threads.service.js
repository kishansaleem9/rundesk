"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatThreadsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const ai_service_1 = require("./ai.service");
const tasks_service_1 = require("../tasks/tasks.service");
const docs_service_1 = require("../docs/docs.service");
const chat_thread_title_1 = require("./chat-thread-title");
/**
 * §15 — AI chats that outlive the panel, and name themselves.
 *
 * Frames `296_1817` → `297_1820` → `304_1907`: "New Chat" becomes "Skill
 * Definition and Ideas" and is still in the sidebar after the panel closes.
 *
 * A thread belongs to one person. These are working notes, often half-formed —
 * making them workspace-visible would publish thinking nobody chose to share.
 */
let ChatThreadsService = class ChatThreadsService {
    constructor(db, ai, tasks, docs) {
        this.db = db;
        this.ai = ai;
        this.tasks = tasks;
        this.docs = docs;
    }
    list(workspaceId, userId) {
        return this.db
            .select({
            id: db_1.aiChatThreads.id,
            title: db_1.aiChatThreads.title,
            skillId: db_1.aiChatThreads.skillId,
            updatedAt: db_1.aiChatThreads.updatedAt,
            /**
             * Written out rather than interpolated. Inside a `.select({})`
             * projection drizzle renders a column reference UNQUALIFIED, so
             * `${aiChatMessages.threadId} = ${aiChatThreads.id}` came out as
             * `where "thread_id" = "id"` — a message's own two columns compared to
             * each other. It matches nothing, returns 0 for every thread, and
             * raises no error at all. Caught by the count check against real
             * Postgres; nothing about the TypeScript looked wrong.
             */
            messageCount: (0, drizzle_orm_1.sql) `(
          select count(*)::int from "ai_chat_messages"
          where "ai_chat_messages"."thread_id" = "ai_chat_threads"."id"
        )`,
        })
            .from(db_1.aiChatThreads)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.aiChatThreads.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.aiChatThreads.userId, userId)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.aiChatThreads.updatedAt))
            .limit(50);
    }
    /**
     * 404 rather than 403 on someone else's thread — the same rule as skills, and
     * for the same reason: a 403 confirms the id names a real conversation.
     */
    async own(workspaceId, userId, threadId) {
        const [row] = await this.db
            .select()
            .from(db_1.aiChatThreads)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.aiChatThreads.id, threadId), (0, drizzle_orm_1.eq)(db_1.aiChatThreads.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Chat not found');
        if (row.userId !== userId)
            throw new common_1.NotFoundException('Chat not found');
        return row;
    }
    async get(workspaceId, userId, threadId) {
        const thread = await this.own(workspaceId, userId, threadId);
        const messages = await this.db
            .select()
            .from(db_1.aiChatMessages)
            .where((0, drizzle_orm_1.eq)(db_1.aiChatMessages.threadId, threadId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.aiChatMessages.createdAt));
        return { ...thread, messages };
    }
    async create(workspaceId, userId, skillId) {
        const [row] = await this.db
            .insert(db_1.aiChatThreads)
            .values({ workspaceId, userId, skillId: skillId ?? null })
            .returning();
        return row;
    }
    /**
     * Append a turn, then name the thread if this is the exchange that made it
     * about something.
     *
     * Naming is best-effort and deliberately never fails the append: losing the
     * message because the title could not be generated would trade the thing
     * being stored for the label on it.
     */
    async append(workspaceId, userId, threadId, turn) {
        const thread = await this.own(workspaceId, userId, threadId);
        const [message] = await this.db
            .insert(db_1.aiChatMessages)
            .values({ threadId, role: turn.role, content: turn.content })
            .returning();
        await this.db
            .update(db_1.aiChatThreads)
            .set({ updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.aiChatThreads.id, threadId));
        const title = await this.maybeTitle(thread, threadId, workspaceId, userId).catch(() => undefined);
        return { message, title };
    }
    async maybeTitle(thread, threadId, workspaceId, userId) {
        const rows = await this.db
            .select({ role: db_1.aiChatMessages.role, content: db_1.aiChatMessages.content })
            .from(db_1.aiChatMessages)
            .where((0, drizzle_orm_1.eq)(db_1.aiChatMessages.threadId, threadId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.aiChatMessages.createdAt))
            .limit(6);
        if (!(0, chat_thread_title_1.shouldAutoTitle)({ ...thread, messageCount: rows.length }))
            return undefined;
        const firstAsked = rows.find((r) => r.role === 'user')?.content ?? '';
        const title = (0, chat_thread_title_1.cleanTitle)(await this.ai.titleForChat(rows, { userId, workspaceId })) ||
            (0, chat_thread_title_1.fallbackTitle)(firstAsked);
        if (!title || title === chat_thread_title_1.DEFAULT_THREAD_TITLE)
            return undefined;
        await this.db
            .update(db_1.aiChatThreads)
            .set({ title })
            .where((0, drizzle_orm_1.eq)(db_1.aiChatThreads.id, threadId));
        return title;
    }
    // ─── The six-icon row, frames `302_1842` / `303_1858` ─────────────────────
    /**
     * Fetch one message, having proved the caller owns its thread.
     *
     * Every action below goes through this rather than reading by message id:
     * a message id alone names nothing the caller has been shown to own, and
     * three separate access checks is three chances to write one wrong.
     */
    async ownMessage(workspaceId, userId, threadId, messageId) {
        await this.own(workspaceId, userId, threadId);
        const [row] = await this.db
            .select()
            .from(db_1.aiChatMessages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.aiChatMessages.id, messageId), (0, drizzle_orm_1.eq)(db_1.aiChatMessages.threadId, threadId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Message not found');
        return row;
    }
    /** The oldest live list in the workspace — the same rule `/task` in chat uses. */
    async defaultList(workspaceId) {
        const [row] = await this.db
            .select({ id: db_1.lists.id })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.lists.isArchived, false)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.lists.createdAt))
            .limit(1);
        return row?.id ?? null;
    }
    /** "Create task from this" — the second icon. */
    async createTaskFrom(workspaceId, userId, threadId, messageId) {
        const message = await this.ownMessage(workspaceId, userId, threadId, messageId);
        const listId = await this.defaultList(workspaceId);
        if (!listId) {
            throw new common_1.BadRequestException('No list is available to create a task in yet — create a space, project and list first.');
        }
        // The first line is the title and the whole answer is the body: an answer's
        // opening sentence is what it is about, and truncating the rest into a
        // title would lose the part worth keeping.
        const title = message.content.split('\n').find((l) => l.trim())?.trim().slice(0, 200) ?? 'From Rundesk AI';
        const task = await this.tasks.createTask({
            listId,
            title,
            description: message.content,
            createdById: userId,
        });
        return { task };
    }
    /** "Save to doc" — the third icon. */
    async saveToDoc(workspaceId, userId, threadId, messageId) {
        const message = await this.ownMessage(workspaceId, userId, threadId, messageId);
        const thread = await this.own(workspaceId, userId, threadId);
        const doc = await this.docs.create({
            workspaceId,
            // Named after the conversation, not the answer: you are saving this out
            // of somewhere, and the thread's title is what you will look for later.
            title: thread.title === chat_thread_title_1.DEFAULT_THREAD_TITLE ? 'From Rundesk AI' : thread.title,
            createdById: userId,
        });
        await this.docs.update(doc.id, userId, {
            content: {
                type: 'doc',
                content: message.content
                    .split('\n\n')
                    .filter((block) => block.trim())
                    .map((block) => ({
                    type: 'paragraph',
                    content: [{ type: 'text', text: block.trim() }],
                })),
            },
        });
        return { doc };
    }
    /** Thumbs up / down — the last two icons. Pressing the same one again clears it. */
    async setFeedback(workspaceId, userId, threadId, messageId, feedback) {
        const message = await this.ownMessage(workspaceId, userId, threadId, messageId);
        const next = message.feedback === feedback ? null : feedback;
        const [row] = await this.db
            .update(db_1.aiChatMessages)
            .set({ feedback: next })
            .where((0, drizzle_orm_1.eq)(db_1.aiChatMessages.id, messageId))
            .returning();
        return row;
    }
    /** A person renaming their own thread turns the automatic naming off for good. */
    async rename(workspaceId, userId, threadId, title) {
        await this.own(workspaceId, userId, threadId);
        const trimmed = (0, chat_thread_title_1.cleanTitle)(title);
        if (!trimmed)
            throw new common_1.ForbiddenException('A chat needs a name');
        const [row] = await this.db
            .update(db_1.aiChatThreads)
            .set({ title: trimmed, titleIsAuto: 'no' })
            .where((0, drizzle_orm_1.eq)(db_1.aiChatThreads.id, threadId))
            .returning();
        return row;
    }
    async remove(workspaceId, userId, threadId) {
        await this.own(workspaceId, userId, threadId);
        await this.db.delete(db_1.aiChatThreads).where((0, drizzle_orm_1.eq)(db_1.aiChatThreads.id, threadId));
        return { ok: true };
    }
};
exports.ChatThreadsService = ChatThreadsService;
exports.ChatThreadsService = ChatThreadsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, ai_service_1.AiService,
        tasks_service_1.TasksService,
        docs_service_1.DocsService])
], ChatThreadsService);
//# sourceMappingURL=chat-threads.service.js.map