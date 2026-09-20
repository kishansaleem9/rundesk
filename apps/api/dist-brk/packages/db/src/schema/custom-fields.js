"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customFieldValuesRelations = exports.customFieldDefinitionsRelations = exports.customFieldValues = exports.customFieldDefinitions = exports.customFieldTypeEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const projects_1 = require("./projects");
const lists_1 = require("./lists");
const tasks_1 = require("./tasks");
exports.customFieldTypeEnum = (0, pg_core_1.pgEnum)('custom_field_type', [
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
]);
/**
 * A custom-field DEFINITION lives at the project level. It can optionally
 * be limited to a specific list (listId not null) but typically applies
 * to every list inside the project.
 */
exports.customFieldDefinitions = (0, pg_core_1.pgTable)('custom_field_definitions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.uuid)('project_id').notNull().references(() => projects_1.projects.id, { onDelete: 'cascade' }),
    listId: (0, pg_core_1.uuid)('list_id').references(() => lists_1.lists.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    type: (0, exports.customFieldTypeEnum)('type').notNull(),
    isRequired: (0, pg_core_1.boolean)('is_required').notNull().default(false),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    // For type='dropdown': [{ label, value, color? }]
    options: (0, pg_core_1.jsonb)('options').$type(),
    /*
     * Type-specific settings that are not an option list. Separate from
     * `options` because that is typed as an ARRAY and every existing reader
     * treats it as one — putting an object there would break them or force each
     * to learn which type stores which shape.
     *
     * progress_auto: { sources: { subtasks, checklists, assignedComments },
     *                  doneStatusIs100 }
     */
    config: (0, pg_core_1.jsonb)('config').$type(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byProject: (0, pg_core_1.index)('custom_field_definitions_project_idx').on(t.projectId),
}));
/**
 * Per-task value for a given custom field. Stored as JSON for type
 * flexibility; the service layer enforces type → JSON shape.
 */
exports.customFieldValues = (0, pg_core_1.pgTable)('custom_field_values', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    fieldId: (0, pg_core_1.uuid)('field_id').notNull().references(() => exports.customFieldDefinitions.id, { onDelete: 'cascade' }),
    // Discriminated by the definition's type:
    //   text/url/long_text/location → { v: string }
    //   number/money/progress_manual → { v: number }
    //   dropdown/tshirt_size        → { v: string }    (option value)
    //   date                        → { v: ISO string }
    //   checkbox                    → { v: boolean }
    //   labels/people               → { v: string[] }  (§V2-01c)
    //
    // No row is ever written for `progress_auto` — it is derived on read.
    value: (0, pg_core_1.jsonb)('value').$type().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqTaskField: (0, pg_core_1.unique)('custom_field_values_task_field_uniq').on(t.taskId, t.fieldId),
    byTask: (0, pg_core_1.index)('custom_field_values_task_idx').on(t.taskId),
}));
exports.customFieldDefinitionsRelations = (0, drizzle_orm_1.relations)(exports.customFieldDefinitions, ({ one, many }) => ({
    project: one(projects_1.projects, { fields: [exports.customFieldDefinitions.projectId], references: [projects_1.projects.id] }),
    list: one(lists_1.lists, { fields: [exports.customFieldDefinitions.listId], references: [lists_1.lists.id] }),
    values: many(exports.customFieldValues),
}));
exports.customFieldValuesRelations = (0, drizzle_orm_1.relations)(exports.customFieldValues, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.customFieldValues.taskId], references: [tasks_1.tasks.id] }),
    definition: one(exports.customFieldDefinitions, {
        fields: [exports.customFieldValues.fieldId],
        references: [exports.customFieldDefinitions.id],
    }),
}));
//# sourceMappingURL=custom-fields.js.map