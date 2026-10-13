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
  // §V2-01c — storage plus a renderer, nothing more.
  'long_text',
  'labels',
  'people',
  'location',
  'tshirt_size',
  'progress_manual',
  // 0145. `files` holds task_attachments ids; `voting` holds the ids of the
  // people who voted, and only the caller can add or remove their own.
  'files',
  'voting',
  /*
   * 0158 — three of the thirteen types frame `00:20`–`00:42` lists and this
   * product had not got. The other ten are recorded as decisions in
   * `docs/video2-reaudit.md` rather than half-built here.
   *
   * `formula` is DERIVED, like `progress_auto`: no row is ever written for it
   * in `custom_field_values`. Its definition carries `config.expression` and
   * the service evaluates it over the task's other numeric fields on read.
   *
   * `tasks` holds task ids — a NAMED, untyped reference to other tasks. It is
   * not `task_dependencies`, which is typed (blocks / blocked by) and drives
   * the Related Items panel; this is a field with a name of its own.
   *
   * `signature` holds the drawn strokes as a string. It records what was
   * drawn and nothing else — no signer, no timestamp claim anywhere on screen,
   * because neither is stored.
   */
  'formula',
  'tasks',
  'signature',
  /*
   * 0184 — ClickUp's Button (`ledger-rows/row-719`). It holds no value: pressing
   * it on a task runs the automations whose trigger is this button
   * (`button.clicked`, filtered by the field's id). Its definition carries
   * `config.label`, the words on the button.
   */
  'button',
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
     * formula:       { expression }   — 0158, e.g. `({Spent} / {Budget}) * 100`
     * button:        { label }        — 0184, the words on the button
     * tasks:         { listId?, rollups? } — a Relationship limited to one list
     *                  (chosen when the field is made, and kept), and the
     *                  fields of that list's tasks shown beside each related
     *                  task (`ledger-rows/row-719`)
     * text, long_text, dropdown: { ai? } — an AI field (`commit-log/log-c980bee-1`):
     *                  { kind, prompt?, language?, autofill?, autoUpdate? }, the
     *                  value written by the model when asked, as ClickUp's AI
     *                  fields live within Short Text, Long Text and Dropdown
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
    //   tasks                       → { v: string[] }  (task ids, 0158)
    //   signature                   → { v: string }    (stroke data, 0158)
    //
    // No row is ever written for `progress_auto` or `formula` — both are
    // derived on read, and both refuse a write rather than accept one they
    // would then ignore.
    // A Location keeps the point its address was placed at beside it, `lat`/`lng`, where a geocoder found one (`ledger-rows/row-777`).
    value:          jsonb('value').$type<{ v: string | number | boolean | string[] | null; lat?: number; lng?: number }>().notNull(),
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
