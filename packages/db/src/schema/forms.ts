import { pgTable, text, timestamp, uuid, boolean, integer, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { lists } from './lists'
import { users } from './users'
import { tasks } from './tasks'

// ─── Forms ────────────────────────────────────────────────────────────────────

export const forms = pgTable('forms', {
  id:               uuid('id').primaryKey().defaultRandom(),
  workspaceId:      uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  targetListId:     uuid('target_list_id').references(() => lists.id, { onDelete: 'set null' }),
  createdById:      uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  title:            text('title').notNull(),
  description:      text('description'),
  coverImageUrl:    text('cover_image_url'),
  isPublic:         boolean('is_public').notNull().default(true), // false = require workspace login
  isEnabled:        boolean('is_enabled').notNull().default(true),
  confirmationMsg:  text('confirmation_msg').default('Thank you! Your request has been submitted.'),
  slug:             text('slug').notNull().unique(), // for shareable URL: /forms/:slug
  isArchived:       boolean('is_archived').notNull().default(false),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Form Fields ──────────────────────────────────────────────────────────────
// Stored as ordered list; position determines render order

export const formFields = pgTable('form_fields', {
  id:           uuid('id').primaryKey().defaultRandom(),
  formId:       uuid('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
  // Field types: short_text | long_text | dropdown | multi_select | date | number | file | email
  type:         text('type').notNull(),
  label:        text('label').notNull(),
  placeholder:  text('placeholder'),
  helpText:     text('help_text'),
  isRequired:   boolean('is_required').notNull().default(false),
  position:     integer('position').notNull().default(0),
  // options JSON for dropdown/multi_select: [{ label, value }]
  options:      jsonb('options').$type<{ label: string; value: string }[]>(),
  // taskField maps this form field to a task property: title | description | priority | assigneeEmail | dueDate | customField:<id>
  taskField:    text('task_field'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Form Submissions ─────────────────────────────────────────────────────────

export const formSubmissions = pgTable('form_submissions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  formId:         uuid('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
  createdTaskId:  uuid('created_task_id').references(() => tasks.id, { onDelete: 'set null' }),
  submitterEmail: text('submitter_email'),
  submitterName:  text('submitter_name'),
  // data: { fieldId: value } map of all submitted values
  data:           jsonb('data').notNull().$type<Record<string, string | string[]>>(),
  submittedAt:    timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const formsRelations = relations(forms, ({ one, many }) => ({
  workspace:   one(workspaces, { fields: [forms.workspaceId], references: [workspaces.id] }),
  targetList:  one(lists, { fields: [forms.targetListId], references: [lists.id] }),
  createdBy:   one(users, { fields: [forms.createdById], references: [users.id] }),
  fields:      many(formFields),
  submissions: many(formSubmissions),
}))

export const formFieldsRelations = relations(formFields, ({ one }) => ({
  form: one(forms, { fields: [formFields.formId], references: [forms.id] }),
}))

export const formSubmissionsRelations = relations(formSubmissions, ({ one }) => ({
  form:        one(forms, { fields: [formSubmissions.formId], references: [forms.id] }),
  createdTask: one(tasks, { fields: [formSubmissions.createdTaskId], references: [tasks.id] }),
}))
