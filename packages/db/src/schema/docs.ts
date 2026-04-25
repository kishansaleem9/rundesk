import { pgTable, text, timestamp, uuid, boolean, integer, jsonb, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { spaces } from './spaces'
import { users } from './users'

// A Doc can live at workspace scope (spaceId = null) or inside a space.
// Content is Tiptap JSON (ProseMirror doc), stored as jsonb for partial updates.
export const docs = pgTable('docs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  spaceId:     uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
  parentDocId: uuid('parent_doc_id').references((): AnyPgColumn => docs.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  title:       text('title').notNull().default('Untitled'),
  icon:        text('icon'),
  coverImageUrl: text('cover_image_url'),
  content:     jsonb('content').$type<Record<string, unknown>>().notNull().default({ type: 'doc', content: [] }),
  plaintext:   text('plaintext').notNull().default(''), // denormalized for search
  position:    integer('position').notNull().default(0),
  isArchived:  boolean('is_archived').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const docsRelations = relations(docs, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [docs.workspaceId], references: [workspaces.id] }),
  space:     one(spaces,     { fields: [docs.spaceId],     references: [spaces.id] }),
  parent:    one(docs,       { fields: [docs.parentDocId], references: [docs.id], relationName: 'doc_children' }),
  children:  many(docs, { relationName: 'doc_children' }),
  creator:   one(users, { fields: [docs.createdById], references: [users.id] }),
}))
