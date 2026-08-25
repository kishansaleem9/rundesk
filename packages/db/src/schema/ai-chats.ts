import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { skills } from './skills'

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
export const aiChatThreads = pgTable(
  'ai_chat_threads',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // A thread belongs to one person. These are not shared conversations:
    // making them visible to a workspace would publish half-formed thinking
    // nobody chose to share.
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title:       text('title').notNull().default('New Chat'),
    /**
     * False until the title has been derived from the conversation, so a person
     * who renames a thread never has it renamed back out from under them.
     */
    titleIsAuto: text('title_is_auto').$type<'yes' | 'no'>().notNull().default('yes'),
    /** Set when the whole conversation is scoped to one skill (§15). */
    skillId:     uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The sidebar lists your threads newest-first, which is this index exactly.
    index('idx_ai_chat_threads_user_ws').on(t.userId, t.workspaceId, t.updatedAt),
  ],
)

export const aiChatMessages = pgTable(
  'ai_chat_messages',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    threadId:  uuid('thread_id').notNull().references(() => aiChatThreads.id, { onDelete: 'cascade' }),
    role:      text('role').$type<'user' | 'assistant'>().notNull(),
    content:   text('content').notNull(),
    /**
     * §15 — the last two of her six icons. Null until someone says something;
     * replaced rather than accumulated, because the question is "was this
     * answer good", not "how has your opinion of it changed".
     */
    feedback:  text('feedback').$type<'up' | 'down'>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_ai_chat_messages_thread').on(t.threadId, t.createdAt)],
)

export const aiChatThreadsRelations = relations(aiChatThreads, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [aiChatThreads.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [aiChatThreads.userId], references: [users.id] }),
  skill:     one(skills, { fields: [aiChatThreads.skillId], references: [skills.id] }),
  messages:  many(aiChatMessages),
}))

export const aiChatMessagesRelations = relations(aiChatMessages, ({ one }) => ({
  thread: one(aiChatThreads, { fields: [aiChatMessages.threadId], references: [aiChatThreads.id] }),
}))
