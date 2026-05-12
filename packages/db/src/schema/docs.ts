import { pgTable, text, timestamp, uuid, boolean, integer, jsonb, index, type AnyPgColumn } from 'drizzle-orm/pg-core'
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
  // Public share: non-null random slug means the doc is readable anonymously
  // at /d/<slug>. Toggled via POST/DELETE /docs/:id/share.
  publicShareId:   text('public_share_id').unique(),
  publicShareEnabledAt: timestamp('public_share_enabled_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const docsRelations = relations(docs, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [docs.workspaceId], references: [workspaces.id] }),
  space:     one(spaces,     { fields: [docs.spaceId],     references: [spaces.id] }),
  parent:    one(docs,       { fields: [docs.parentDocId], references: [docs.id], relationName: 'doc_children' }),
  children:  many(docs, { relationName: 'doc_children' }),
  creator:   one(users, { fields: [docs.createdById], references: [users.id] }),
  comments:  many(docComments),
}))

// Threaded comments anchored to a doc. `parentCommentId` is null for thread roots.
// `selection` optionally captures the highlighted range as ProseMirror positions.
export const docComments = pgTable(
  'doc_comments',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    docId:            uuid('doc_id').notNull().references(() => docs.id, { onDelete: 'cascade' }),
    workspaceId:      uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    authorId:         uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    parentCommentId:  uuid('parent_comment_id').references((): AnyPgColumn => docComments.id, { onDelete: 'cascade' }),
    body:             text('body').notNull(),
    selection:        jsonb('selection').$type<{ from: number; to: number; quote?: string } | null>(),
    isResolved:       boolean('is_resolved').notNull().default(false),
    resolvedById:     uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt:       timestamp('resolved_at', { withTimezone: true }),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_doc_comments_doc').on(t.docId),
    index('idx_doc_comments_thread').on(t.docId, t.parentCommentId),
  ],
)

export const docCommentsRelations = relations(docComments, ({ one, many }) => ({
  doc:        one(docs, { fields: [docComments.docId], references: [docs.id] }),
  workspace:  one(workspaces, { fields: [docComments.workspaceId], references: [workspaces.id] }),
  author:     one(users, { fields: [docComments.authorId], references: [users.id] }),
  resolver:   one(users, { fields: [docComments.resolvedById], references: [users.id] }),
  parent:     one(docComments, {
    fields: [docComments.parentCommentId],
    references: [docComments.id],
    relationName: 'doc_comment_replies',
  }),
  replies:    many(docComments, { relationName: 'doc_comment_replies' }),
}))
