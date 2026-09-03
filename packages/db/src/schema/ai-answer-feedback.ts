import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'
import { workspaces } from './workspaces'

/**
 * §G02 frames `020_0124`–`035_0203` — the thumbs under a palette answer.
 *
 * The AI chat already has feedback, but it hangs off a persisted message
 * (`ai_chat_messages`). A palette answer has no message: it is one shot, it is
 * never listed anywhere, and writing every stray search into somebody's chat
 * history to give the thumbs something to point at would be a worse trade than
 * the thumbs are worth.
 *
 * So the key is the question itself, normalised. That is what the person is
 * actually rating — "the answer you give for this" — and it survives the answer
 * being regenerated, which a message id would not.
 *
 * One row per person per question: pressing the same thumb again clears it,
 * matching the convention `chat-threads.controller.ts` already set.
 */
export const aiAnswerFeedback = pgTable(
  'ai_answer_feedback',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // Lower-cased and trimmed on the way in, so "Invoices" and "invoices " are
    // one opinion rather than two.
    question:    text('question').notNull(),
    // 'up' | 'down'. Absence of a row is "no opinion" — the third state is the
    // missing row, not a third value, so clearing is a delete.
    rating:      text('rating').notNull(),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_ai_answer_feedback').on(t.workspaceId, t.userId, t.question),
    index('idx_ai_answer_feedback_workspace').on(t.workspaceId, t.createdAt),
  ],
)
