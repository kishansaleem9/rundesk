"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiChatMessagesRelations = exports.aiChatThreadsRelations = exports.aiChatMessages = exports.aiChatThreads = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
const skills_1 = require("./skills");
/**
 * §15 — AI chats that outlive the panel.
 *
 * Frames `296_1817` → `297_1820` → `301_1836`: a conversation starts as
 * "New Chat", renames itself from its own content to "Skill Definition and
 * Ideas", and is still listed in the sidebar at `304_1907` after the panel has
 * been closed.
 *
 * Rundesk's AI panel held its messages in React state, so closing it threw the
 * conversation away — including, in the flow this section is about, the one
 * where you and the assistant worked out what a skill should be.
 */
exports.aiChatThreads = (0, pg_core_1.pgTable)('ai_chat_threads', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    // A thread belongs to one person. These are not shared conversations:
    // making them visible to a workspace would publish half-formed thinking
    // nobody chose to share.
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    title: (0, pg_core_1.text)('title').notNull().default('New Chat'),
    /**
     * False until the title has been derived from the conversation, so a person
     * who renames a thread never has it renamed back out from under them.
     */
    titleIsAuto: (0, pg_core_1.text)('title_is_auto').$type().notNull().default('yes'),
    /** Set when the whole conversation is scoped to one skill (§15). */
    skillId: (0, pg_core_1.uuid)('skill_id').references(() => skills_1.skills.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // The sidebar lists your threads newest-first, which is this index exactly.
    (0, pg_core_1.index)('idx_ai_chat_threads_user_ws').on(t.userId, t.workspaceId, t.updatedAt),
]);
exports.aiChatMessages = (0, pg_core_1.pgTable)('ai_chat_messages', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    threadId: (0, pg_core_1.uuid)('thread_id').notNull().references(() => exports.aiChatThreads.id, { onDelete: 'cascade' }),
    role: (0, pg_core_1.text)('role').$type().notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    /**
     * §15 — the last two of her six icons. Null until someone says something;
     * replaced rather than accumulated, because the question is "was this
     * answer good", not "how has your opinion of it changed".
     */
    feedback: (0, pg_core_1.text)('feedback').$type(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.index)('idx_ai_chat_messages_thread').on(t.threadId, t.createdAt)]);
exports.aiChatThreadsRelations = (0, drizzle_orm_1.relations)(exports.aiChatThreads, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.aiChatThreads.workspaceId], references: [workspaces_1.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.aiChatThreads.userId], references: [users_1.users.id] }),
    skill: one(skills_1.skills, { fields: [exports.aiChatThreads.skillId], references: [skills_1.skills.id] }),
    messages: many(exports.aiChatMessages),
}));
exports.aiChatMessagesRelations = (0, drizzle_orm_1.relations)(exports.aiChatMessages, ({ one }) => ({
    thread: one(exports.aiChatThreads, { fields: [exports.aiChatMessages.threadId], references: [exports.aiChatThreads.id] }),
}));
//# sourceMappingURL=ai-chats.js.map