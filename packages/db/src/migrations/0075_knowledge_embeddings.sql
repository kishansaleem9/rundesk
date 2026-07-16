-- =====================================================================
-- 0075_knowledge_embeddings.sql  (Plan §15.1 — Semantic Knowledge Base)
--
-- ADDITIVE + IDEMPOTENT — safe to re-run. Adds a single table:
--   * knowledge_embeddings — the vector store backing "Ask about your
--                            workspace". One row per embedded source (task,
--                            doc, or task comment).
--
-- PORTABILITY: `embedding` is a plain `double precision[]` (float8[]), NOT the
-- pgvector `vector` type. There is deliberately NO `CREATE EXTENSION vector`,
-- so this migration runs on stock Postgres and the feature is fully testable
-- with no extension. Vectors are stored L2-normalized, so cosine similarity is
-- a dot product computed in the app. `source_type` / `dim` are plain columns
-- validated at the app layer (like the billing/support tables) — no CREATE TYPE
-- to make non-idempotent. Every statement uses IF NOT EXISTS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "knowledge_embeddings" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "source_type"   text NOT NULL,
  "source_id"     uuid NOT NULL,
  "title"         text DEFAULT '' NOT NULL,
  "url"           text DEFAULT '' NOT NULL,
  "content_hash"  text NOT NULL,
  "embedding"     double precision[] NOT NULL,
  "dim"           integer NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_embeddings_source_unique" ON "knowledge_embeddings" ("source_type","source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_embeddings_workspace_idx" ON "knowledge_embeddings" ("workspace_id");
