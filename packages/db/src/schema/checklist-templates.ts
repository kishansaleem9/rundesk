import { pgTable, text, timestamp, uuid, integer, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * Reusable checklists ("QA pass", "Client onboarding") that can be dropped onto
 * any task. Workspace-scoped, and the items are a snapshot: applying a template
 * copies rows, so editing the template later never rewrites checklists already
 * created from it — same contract as doc templates.
 */
export const checklistTemplates = pgTable(
  'checklist_templates',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('checklist_templates_workspace_idx').on(t.workspaceId),
  }),
)

export const checklistTemplateItems = pgTable(
  'checklist_template_items',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id').notNull().references(() => checklistTemplates.id, { onDelete: 'cascade' }),
    content:    text('content').notNull(),
    position:   integer('position').notNull().default(0),
    createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTemplate: index('checklist_template_items_template_idx').on(t.templateId),
  }),
)

export const checklistTemplatesRelations = relations(checklistTemplates, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [checklistTemplates.workspaceId], references: [workspaces.id] }),
  creator:   one(users, { fields: [checklistTemplates.createdById], references: [users.id] }),
  items:     many(checklistTemplateItems),
}))

export const checklistTemplateItemsRelations = relations(checklistTemplateItems, ({ one }) => ({
  template: one(checklistTemplates, {
    fields: [checklistTemplateItems.templateId],
    references: [checklistTemplates.id],
  }),
}))
