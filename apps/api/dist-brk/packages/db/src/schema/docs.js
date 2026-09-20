"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.docRevisionsRelations = exports.docRevisions = exports.docCommentsRelations = exports.docComments = exports.docsRelations = exports.docs = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const spaces_1 = require("./spaces");
const users_1 = require("./users");
// A Doc can live at workspace scope (spaceId = null) or inside a space.
// Content is Tiptap JSON (ProseMirror doc), stored as jsonb for partial updates.
exports.docs = (0, pg_core_1.pgTable)('docs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    spaceId: (0, pg_core_1.uuid)('space_id').references(() => spaces_1.spaces.id, { onDelete: 'cascade' }),
    parentDocId: (0, pg_core_1.uuid)('parent_doc_id').references(() => exports.docs.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    title: (0, pg_core_1.text)('title').notNull().default('Untitled'),
    icon: (0, pg_core_1.text)('icon'),
    coverImageUrl: (0, pg_core_1.text)('cover_image_url'),
    content: (0, pg_core_1.jsonb)('content').$type().notNull().default({ type: 'doc', content: [] }),
    plaintext: (0, pg_core_1.text)('plaintext').notNull().default(''), // denormalized for search
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    // §13.4 Trash — when the item was deleted and by whom (null = unknown/legacy).
    archivedAt: (0, pg_core_1.timestamp)('archived_at', { withTimezone: true }),
    archivedById: (0, pg_core_1.uuid)('archived_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    // Public share: non-null random slug means the doc is readable anonymously
    // at /d/<slug>. Toggled via POST/DELETE /docs/:id/share.
    publicShareId: (0, pg_core_1.text)('public_share_id').unique(),
    publicShareEnabledAt: (0, pg_core_1.timestamp)('public_share_enabled_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.docsRelations = (0, drizzle_orm_1.relations)(exports.docs, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.docs.workspaceId], references: [workspaces_1.workspaces.id] }),
    space: one(spaces_1.spaces, { fields: [exports.docs.spaceId], references: [spaces_1.spaces.id] }),
    parent: one(exports.docs, { fields: [exports.docs.parentDocId], references: [exports.docs.id], relationName: 'doc_children' }),
    children: many(exports.docs, { relationName: 'doc_children' }),
    creator: one(users_1.users, { fields: [exports.docs.createdById], references: [users_1.users.id] }),
    comments: many(exports.docComments),
}));
// Threaded comments anchored to a doc. `parentCommentId` is null for thread roots.
// `selection` optionally captures the highlighted range as ProseMirror positions.
exports.docComments = (0, pg_core_1.pgTable)('doc_comments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    docId: (0, pg_core_1.uuid)('doc_id').notNull().references(() => exports.docs.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    authorId: (0, pg_core_1.uuid)('author_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    parentCommentId: (0, pg_core_1.uuid)('parent_comment_id').references(() => exports.docComments.id, { onDelete: 'cascade' }),
    body: (0, pg_core_1.text)('body').notNull(),
    selection: (0, pg_core_1.jsonb)('selection').$type(),
    isResolved: (0, pg_core_1.boolean)('is_resolved').notNull().default(false),
    resolvedById: (0, pg_core_1.uuid)('resolved_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_doc_comments_doc').on(t.docId),
    (0, pg_core_1.index)('idx_doc_comments_thread').on(t.docId, t.parentCommentId),
]);
exports.docCommentsRelations = (0, drizzle_orm_1.relations)(exports.docComments, ({ one, many }) => ({
    doc: one(exports.docs, { fields: [exports.docComments.docId], references: [exports.docs.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.docComments.workspaceId], references: [workspaces_1.workspaces.id] }),
    author: one(users_1.users, { fields: [exports.docComments.authorId], references: [users_1.users.id] }),
    resolver: one(users_1.users, { fields: [exports.docComments.resolvedById], references: [users_1.users.id] }),
    parent: one(exports.docComments, {
        fields: [exports.docComments.parentCommentId],
        references: [exports.docComments.id],
        relationName: 'doc_comment_replies',
    }),
    replies: many(exports.docComments, { relationName: 'doc_comment_replies' }),
}));
// Point-in-time snapshots of a doc's content for version history / restore.
// A snapshot is written on create and on each content-changing save; saves by
// the same editor within a short window coalesce into the latest snapshot so
// the timeline stays meaningful instead of one row per autosave.
exports.docRevisions = (0, pg_core_1.pgTable)('doc_revisions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    docId: (0, pg_core_1.uuid)('doc_id').notNull().references(() => exports.docs.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    editorId: (0, pg_core_1.uuid)('editor_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    title: (0, pg_core_1.text)('title').notNull().default('Untitled'),
    content: (0, pg_core_1.jsonb)('content').$type().notNull().default({ type: 'doc', content: [] }),
    plaintext: (0, pg_core_1.text)('plaintext').notNull().default(''),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.index)('idx_doc_revisions_doc').on(t.docId, t.updatedAt)]);
exports.docRevisionsRelations = (0, drizzle_orm_1.relations)(exports.docRevisions, ({ one }) => ({
    doc: one(exports.docs, { fields: [exports.docRevisions.docId], references: [exports.docs.id] }),
    editor: one(users_1.users, { fields: [exports.docRevisions.editorId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=docs.js.map