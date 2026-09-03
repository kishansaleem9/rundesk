import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

/**
 * §6 frame `087_0535` — the "Notepad" row in Personal Tools.
 *
 * A personal scratch pad, one row per person. Deliberately not a document
 * system: Docs already exist for anything wanting a title, sharing or a place
 * in the tree, and two ways to write a paragraph is how they drift.
 *
 * Not workspace-scoped. It belongs to the person, as ClickUp's does — a
 * thought jotted in one workspace vanishing when they switch would be the
 * opposite of a scratch pad.
 */
export const userNotepads = pgTable('user_notepads', {
  userId:    uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  content:   text('content').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
