"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiAnswerFeedback = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
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
exports.aiAnswerFeedback = (0, pg_core_1.pgTable)('ai_answer_feedback', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    // Lower-cased and trimmed on the way in, so "Invoices" and "invoices " are
    // one opinion rather than two.
    question: (0, pg_core_1.text)('question').notNull(),
    // 'up' | 'down'. Absence of a row is "no opinion" — the third state is the
    // missing row, not a third value, so clearing is a delete.
    rating: (0, pg_core_1.text)('rating').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.uniqueIndex)('uq_ai_answer_feedback').on(t.workspaceId, t.userId, t.question),
    (0, pg_core_1.index)('idx_ai_answer_feedback_workspace').on(t.workspaceId, t.createdAt),
]);
//# sourceMappingURL=ai-answer-feedback.js.map