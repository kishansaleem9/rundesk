import { pgTable, text, timestamp, uuid, jsonb, integer, pgEnum, boolean, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { projects } from './projects'
import { lists } from './lists'
import { tasks } from './tasks'

export const customFieldTypeEnum = pgEnum('custom_field_type', [
  'text',
  'number',
  'dropdown',
  'date',
  'checkbox',
  'url',
  'email',
  'phone',
  'money',
  'rating',
  // §V2-01b, frame `00:25` — the one field she demonstrates. Its value is
  // DERIVED from subtasks, checklists and assigned comments, so no row is ever
  // written for it in `custom_field_values`; the service computes it on read.
  'progress_auto',
  // §V2-01c — storage plus a renderer, nothing more. Files and Voting are
  // deliberately absent: one needs upload plumbing, the other needs to know
  // who voted, and `setValue` has no actor because every other type's value
  // is the same for everybody.
  'long_text',
  'labels',
  'people',
  'location',
  'tshirt_size',
  'progress_manual',
])

/**
 * A custom-field DEFINITION lives at the project level. It can optionally
 * be limited to a specific list (listId not null) but typically applies
 * to every list inside the project.
 */
export const customFieldDefinitions = pgTable(
  'custom_field_definitions',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    projectId:    uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    listId:       uuid('list_id').references(() => lists.id, { onDelete: 'cascade' }),
    name:         text('name').notNull(),
    type:         customFieldTypeEnum('type').notNull(),
    isRequired:   boolean('is_required').notNull().default(false),
    position:     integer('position').notNull().default(0),
    // For type='dropdown': [{ label, value, color? }]
    options:      jsonb('options').$type<Array<{ label: string; value: string; color?: string }>>(),
    /*
     * Type-specific settings that are not an option list. Separate from
     * `options` because that is typed as an ARRAY and every existing reader
     * treats it as one — putting an object there would break them or force each
     * to learn which type stores which shape.
     *
     * progress_auto: { sources: { subtasks, checklists, assignedComments },
     *                  doneStatusIs100 }
     */
    config:       jsonb('config').$type<Record<string, unknown>>(),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProject: index('custom_field_definitions_project_idx').on(t.projectId),
  }),
)

/**
 * Per-task value for a given custom field. Stored as JSON for type
 * flexibility; the service layer enforces type → JSON shape.
 */
export const customFieldValues = pgTable(
  'custom_field_values',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    taskId:         uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    fieldId:        uuid('field_id').notNull().references(() => customFieldDefinitions.id, { onDelete: 'cascade' }),
    // Discriminated by the definition's type:
    //   text/url/long_text/location → { v: string }
    //   number/money/progress_manual → { v: number }
    //   dropdown/tshirt_size        → { v: string }    (option value)
    //   date                        → { v: ISO string }
    //   checkbox                    → { v: boolean }
    //   labels/people               → { v: string[] }  (§V2-01c)
    //
    // No row is ever written for `progress_auto` — it is derived on read.
    value:          jsonb('value').$type<{ v: string | number | boolean | string[] | null }>().notNull(),
    updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTaskField: unique('custom_field_values_task_field_uniq').on(t.taskId, t.fieldId),
    byTask: index('custom_field_values_task_idx').on(t.taskId),
  }),
)

export const customFieldDefinitionsRelations = relations(customFieldDefinitions, ({ one, many }) => ({
  project: one(projects, { fields: [customFieldDefinitions.projectId], references: [projects.id] }),
  list:    one(lists, { fields: [customFieldDefinitions.listId], references: [lists.id] }),
  values:  many(customFieldValues),
}))

export const customFieldValuesRelations = relations(customFieldValues, ({ one }) => ({
  task:       one(tasks, { fields: [customFieldValues.taskId], references: [tasks.id] }),
  definition: one(customFieldDefinitions, {
    fields: [customFieldValues.fieldId],
    references: [customFieldDefinitions.id],
  }),
}))
