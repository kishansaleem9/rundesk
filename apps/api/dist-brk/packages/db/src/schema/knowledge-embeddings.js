"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeEmbeddingsRelations = exports.knowledgeEmbeddings = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
exports.knowledgeEmbeddings = (0, pg_core_1.pgTable)('knowledge_embeddings', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    // Polymorphic source — no FK (points at tasks / docs / task_comments /
    // task_attachments). Stale rows for deleted sources are harmless: retrieval
    // re-checks access against the live source table, so a deleted source can
    // never be cited.
    sourceType: (0, pg_core_1.text)('source_type').$type().notNull(),
    sourceId: (0, pg_core_1.uuid)('source_id').notNull(),
    title: (0, pg_core_1.text)('title').notNull().default(''),
    url: (0, pg_core_1.text)('url').notNull().default(''),
    // Stable hash of the embedded text, so re-indexing can skip unchanged rows.
    contentHash: (0, pg_core_1.text)('content_hash').notNull(),
    // L2-normalized embedding as a portable float8[]. `dim` records its length
    // so a workspace's rows stay comparable and a dim mismatch (e.g. after
    // switching embedder) can be skipped rather than mis-ranked.
    embedding: (0, pg_core_1.doublePrecision)('embedding').array().notNull(),
    dim: (0, pg_core_1.integer)('dim').notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // One embedding per source — makes the indexer's upsert-by-source correct.
    (0, pg_core_1.uniqueIndex)('knowledge_embeddings_source_unique').on(t.sourceType, t.sourceId),
    (0, pg_core_1.index)('knowledge_embeddings_workspace_idx').on(t.workspaceId),
]);
exports.knowledgeEmbeddingsRelations = (0, drizzle_orm_1.relations)(exports.knowledgeEmbeddings, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.knowledgeEmbeddings.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=knowledge-embeddings.js.map