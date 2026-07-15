import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * Reusable doc templates (meeting notes, PRDs, etc.). A snapshot of a doc's
 * Tiptap content that a new doc can be spun up from. Workspace-scoped; the
 * content is denormalized so applying a template never drifts with later edits
 * to the doc it was saved from.
 */
export const docTemplates = pgTable(
  'doc_templates',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    description: text('description'),
    icon:        text('icon'),
    content:     jsonb('content').$type<Record<string, unknown>>().notNull().default({ type: 'doc', content: [] }),
    plaintext:   text('plaintext').notNull().default(''),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('doc_templates_workspace_idx').on(t.workspaceId),
  }),
)

export const docTemplatesRelations = relations(docTemplates, ({ one }) => ({
  workspace: one(workspaces, { fields: [docTemplates.workspaceId], references: [workspaces.id] }),
  creator:   one(users, { fields: [docTemplates.createdById], references: [users.id] }),
}))
