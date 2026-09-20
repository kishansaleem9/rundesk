"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formSubmissionsRelations = exports.formFieldsRelations = exports.formsRelations = exports.formSubmissions = exports.formFields = exports.forms = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const lists_1 = require("./lists");
const users_1 = require("./users");
const tasks_1 = require("./tasks");
// ─── Forms ────────────────────────────────────────────────────────────────────
exports.forms = (0, pg_core_1.pgTable)('forms', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    targetListId: (0, pg_core_1.uuid)('target_list_id').references(() => lists_1.lists.id, { onDelete: 'set null' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    coverImageUrl: (0, pg_core_1.text)('cover_image_url'),
    isPublic: (0, pg_core_1.boolean)('is_public').notNull().default(true), // false = require workspace login
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    confirmationMsg: (0, pg_core_1.text)('confirmation_msg').default('Thank you! Your request has been submitted.'),
    slug: (0, pg_core_1.text)('slug').notNull().unique(), // for shareable URL: /forms/:slug
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Form Fields ──────────────────────────────────────────────────────────────
// Stored as ordered list; position determines render order
exports.formFields = (0, pg_core_1.pgTable)('form_fields', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    formId: (0, pg_core_1.uuid)('form_id').notNull().references(() => exports.forms.id, { onDelete: 'cascade' }),
    // Field types: short_text | long_text | dropdown | multi_select | date | number | file | email
    type: (0, pg_core_1.text)('type').notNull(),
    label: (0, pg_core_1.text)('label').notNull(),
    placeholder: (0, pg_core_1.text)('placeholder'),
    helpText: (0, pg_core_1.text)('help_text'),
    isRequired: (0, pg_core_1.boolean)('is_required').notNull().default(false),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    // options JSON:
    // - legacy: [{ label, value }] for dropdown/multi_select
    // - advanced: { choices: [{ label, value }], visibilityRules: [{ fieldId, operator, value }] }
    options: (0, pg_core_1.jsonb)('options').$type(),
    // taskField maps this form field to a task property: title | description | priority | assigneeEmail | dueDate | customField:<id>
    taskField: (0, pg_core_1.text)('task_field'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Form Submissions ─────────────────────────────────────────────────────────
exports.formSubmissions = (0, pg_core_1.pgTable)('form_submissions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    formId: (0, pg_core_1.uuid)('form_id').notNull().references(() => exports.forms.id, { onDelete: 'cascade' }),
    createdTaskId: (0, pg_core_1.uuid)('created_task_id').references(() => tasks_1.tasks.id, { onDelete: 'set null' }),
    submitterEmail: (0, pg_core_1.text)('submitter_email'),
    submitterName: (0, pg_core_1.text)('submitter_name'),
    // data: { fieldId: value } map of all submitted values
    data: (0, pg_core_1.jsonb)('data').notNull().$type(),
    submittedAt: (0, pg_core_1.timestamp)('submitted_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Relations ────────────────────────────────────────────────────────────────
exports.formsRelations = (0, drizzle_orm_1.relations)(exports.forms, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.forms.workspaceId], references: [workspaces_1.workspaces.id] }),
    targetList: one(lists_1.lists, { fields: [exports.forms.targetListId], references: [lists_1.lists.id] }),
    createdBy: one(users_1.users, { fields: [exports.forms.createdById], references: [users_1.users.id] }),
    fields: many(exports.formFields),
    submissions: many(exports.formSubmissions),
}));
exports.formFieldsRelations = (0, drizzle_orm_1.relations)(exports.formFields, ({ one }) => ({
    form: one(exports.forms, { fields: [exports.formFields.formId], references: [exports.forms.id] }),
}));
exports.formSubmissionsRelations = (0, drizzle_orm_1.relations)(exports.formSubmissions, ({ one }) => ({
    form: one(exports.forms, { fields: [exports.formSubmissions.formId], references: [exports.forms.id] }),
    createdTask: one(tasks_1.tasks, { fields: [exports.formSubmissions.createdTaskId], references: [tasks_1.tasks.id] }),
}));
//# sourceMappingURL=forms.js.map