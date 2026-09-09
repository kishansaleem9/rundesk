import { pgTable, text, timestamp, uuid, boolean, jsonb, integer, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * A reusable single-task template scoped to a workspace.
 *
 * Captures everything you'd want to clone when creating a new task
 * from a recipe: title, description, priority, time estimate,
 * date offsets (relative to instantiation), labels (by name so the
 * template survives label renames), checklists with items, one level
 * of subtasks, and custom-field values keyed by field name (resolved
 * to the target project's field definitions at instantiate time).
 *
 * Status is intentionally NOT captured — each list owns its own
 * custom statuses, so instantiation picks the first 'open' status
 * of the target list to stay portable across pipelines.
 */
export const taskTemplates = pgTable(
  'task_templates',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:         text('name').notNull(),
    description:  text('description'),
    icon:         text('icon'),
    // Snapshot of the task — see TaskTemplatePayload in
    // task-templates.service.ts for the canonical shape.
    payload:      jsonb('payload').$type<TaskTemplatePayload>().notNull(),
    usageCount:   integer('usage_count').notNull().default(0),
    createdById:  uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_task_templates_workspace').on(t.workspaceId),
    index('idx_task_templates_workspace_name').on(t.workspaceId, t.name),
  ],
)

export const taskTemplatesRelations = relations(taskTemplates, ({ one }) => ({
  workspace: one(workspaces, { fields: [taskTemplates.workspaceId], references: [workspaces.id] }),
  createdBy: one(users,      { fields: [taskTemplates.createdById], references: [users.id] }),
}))

/**
 * Authoritative shape for `taskTemplates.payload`. Re-exported from
 * task-templates.service.ts is the source of truth; this re-declaration
 * lives in the schema only so Drizzle's `$type<>` can type the column.
 * Keep the two in sync.
 */
export type TaskTemplatePayload = {
  title: string
  description: string | null
  priority: 'urgent' | 'high' | 'normal' | 'low'
  timeEstimate: number | null // seconds
  startDateOffsetDays: number | null
  dueDateOffsetDays: number | null
  labels: string[] // label names, resolved against target workspace at instantiate
  checklists: Array<{
    title: string
    items: Array<{ content: string }>
  }>
  subtasks: Array<{
    title: string
    description: string | null
    priority: 'urgent' | 'high' | 'normal' | 'low'
    timeEstimate: number | null
    dueDateOffsetDays: number | null
  }>
  customFieldValues: Array<{
    fieldName: string
    // `string[]` for §V2-01c's `labels` and `people`. Widened here rather than
    // filtered out in the template writer: a template that silently dropped a
    // task's people field would restore a task that looks complete and is not.
    value: string | number | boolean | string[] | null
  }>
}
