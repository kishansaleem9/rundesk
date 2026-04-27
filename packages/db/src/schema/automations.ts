import { pgTable, text, timestamp, uuid, boolean, integer, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

// ─── Automation Rules ─────────────────────────────────────────────────────────
//
// Trigger types: task.created | task.status_changed | task.due_passed |
//                task.comment_added | task.assignee_changed | task.overdue
//
// Action types: change_status | assign_member | set_priority |
//               send_notification | create_subtask | post_to_channel

export const automations = pgTable('automations', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  name:        text('name').notNull(),
  isEnabled:   boolean('is_enabled').notNull().default(true),

  // Trigger definition
  // { type: 'task.status_changed', filters: { fromStatus?: string, toStatus?: string, projectId?: string } }
  trigger:     jsonb('trigger').notNull().$type<{
    type: string
    filters?: Record<string, string | string[] | undefined>
  }>(),

  // Array of action definitions
  // [{ type: 'change_status', params: { status: 'done' } }, ...]
  actions:     jsonb('actions').notNull().$type<Array<{
    type: string
    params: Record<string, string | string[] | undefined>
  }>>(),

  // Stats
  runCount:    integer('run_count').notNull().default(0),
  lastRunAt:   timestamp('last_run_at', { withTimezone: true }),

  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Run log — record of each time an automation fired
export const automationRuns = pgTable('automation_runs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  automationId: uuid('automation_id').notNull().references(() => automations.id, { onDelete: 'cascade' }),
  triggeredAt:  timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  // context: { taskId, userId, changedField, etc. }
  context:      jsonb('context').$type<Record<string, string>>(),
  // outcome: 'success' | 'error'
  outcome:      text('outcome').notNull().default('success'),
  errorMsg:     text('error_msg'),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const automationsRelations = relations(automations, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [automations.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [automations.createdById], references: [users.id] }),
  runs:      many(automationRuns),
}))

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  automation: one(automations, { fields: [automationRuns.automationId], references: [automations.id] }),
}))
