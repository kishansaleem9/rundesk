import { pgTable, text, timestamp, uuid, integer, doublePrecision, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { spaces } from './spaces'
import { tasks } from './tasks'

export type SprintStatus = 'planned' | 'active' | 'completed' | 'cancelled'

export const sprints = pgTable('sprints', {
  id:           uuid('id').primaryKey().defaultRandom(),
  workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  spaceId:      uuid('space_id').references(() => spaces.id, { onDelete: 'set null' }),
  name:         text('name').notNull(),
  goal:         text('goal'),
  status:       text('status').$type<SprintStatus>().notNull().default('planned'),
  startDate:    timestamp('start_date', { withTimezone: true }).notNull(),
  endDate:      timestamp('end_date',   { withTimezone: true }).notNull(),
  closedAt:     timestamp('closed_at',  { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sprintTasks = pgTable(
  'sprint_tasks',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    sprintId:  uuid('sprint_id').notNull().references(() => sprints.id, { onDelete: 'cascade' }),
    taskId:    uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    storyPoints: doublePrecision('story_points'),
    addedAt:   timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqSprintTask: uniqueIndex('sprint_tasks_unique').on(t.sprintId, t.taskId),
  }),
)

export const sprintsRelations = relations(sprints, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [sprints.workspaceId], references: [workspaces.id] }),
  space:     one(spaces,     { fields: [sprints.spaceId],     references: [spaces.id] }),
  tasks:     many(sprintTasks),
}))

export const sprintTasksRelations = relations(sprintTasks, ({ one }) => ({
  sprint: one(sprints, { fields: [sprintTasks.sprintId], references: [sprints.id] }),
  task:   one(tasks,   { fields: [sprintTasks.taskId],   references: [tasks.id] }),
}))
