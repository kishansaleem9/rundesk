import { pgTable, text, timestamp, uuid, integer, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'

/**
 * Semantic knowledge store (Plan §15.1). One row = one embedded piece of
 * workspace content (a task, a doc, a task comment, or the extracted text of a
 * task attachment), used to answer "Ask about your workspace" via vector
 * similarity instead of keyword match.
 *
 * PORTABILITY — the `embedding` column is a plain `double precision[]` (float8[]),
 * NOT the pgvector `vector` type. This means the table works on stock Postgres
 * with no `CREATE EXTENSION vector`, so the migration stays additive/idempotent
 * and the whole feature is testable on the verify database (and in CI) without
 * any extension. Cosine similarity is computed in the app (vectors are stored
 * L2-normalized, so cosine == dot product). If pgvector is ever present it can
 * be layered on top; it is intentionally NOT required.
 */
/*
 * §G14-15 — meetings are a source like any other.
 *
 * Meeting notes are frequently the only written record of a decision, and the
 * assistant could not ground an answer in one: keyword search would find the
 * meeting, and asking Brain about it turned up nothing. There is no reason for
 * the one place decisions are written down to be the one place retrieval
 * cannot see.
 */
export type KnowledgeSourceType = 'task' | 'doc' | 'comment' | 'attachment' | 'meeting'

export const knowledgeEmbeddings = pgTable(
  'knowledge_embeddings',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // Polymorphic source — no FK (points at tasks / docs / task_comments /
    // task_attachments). Stale rows for deleted sources are harmless: retrieval
    // re-checks access against the live source table, so a deleted source can
    // never be cited.
    sourceType:  text('source_type').$type<KnowledgeSourceType>().notNull(),
    sourceId:    uuid('source_id').notNull(),
    title:       text('title').notNull().default(''),
    url:         text('url').notNull().default(''),
    // Stable hash of the embedded text, so re-indexing can skip unchanged rows.
    contentHash: text('content_hash').notNull(),
    // L2-normalized embedding as a portable float8[]. `dim` records its length
    // so a workspace's rows stay comparable and a dim mismatch (e.g. after
    // switching embedder) can be skipped rather than mis-ranked.
    embedding:   doublePrecision('embedding').array().notNull(),
    dim:         integer('dim').notNull(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One embedding per source — makes the indexer's upsert-by-source correct.
    uniqueIndex('knowledge_embeddings_source_unique').on(t.sourceType, t.sourceId),
    index('knowledge_embeddings_workspace_idx').on(t.workspaceId),
  ],
)

export const knowledgeEmbeddingsRelations = relations(knowledgeEmbeddings, ({ one }) => ({
  workspace: one(workspaces, { fields: [knowledgeEmbeddings.workspaceId], references: [workspaces.id] }),
}))
