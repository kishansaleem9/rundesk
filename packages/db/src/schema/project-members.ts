import { pgTable, uuid, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { projects } from './projects'
import { users } from './users'
import { containerRoleEnum } from './enums'

/**
 * Explicit membership of a Project. Only load-bearing when the project (or its
 * owning space) is 'private'. The project creator is seeded as an 'admin'
 * member (migration 0035).
 */
export const projectMembers = pgTable(
  'project_members',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role:      containerRoleEnum('role').notNull().default('edit'),
    addedById: uuid('added_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_project_members_project_user').on(t.projectId, t.userId),
    index('idx_project_members_project').on(t.projectId),
    index('idx_project_members_user').on(t.userId),
  ],
)

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user:    one(users,    { fields: [projectMembers.userId],    references: [users.id] }),
}))
