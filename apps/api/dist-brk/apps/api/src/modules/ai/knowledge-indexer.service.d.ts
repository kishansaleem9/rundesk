import { type KnowledgeSourceType } from '@rundesk/db';
import type { Db } from '@rundesk/db';
import { R2Service } from '../../common/storage/r2.service';
import { EmbeddingService } from './embedding.service';
/** A piece of workspace content to embed, resolved to its citation shape. */
export type KnowledgeSourceItem = {
    sourceType: KnowledgeSourceType;
    sourceId: string;
    title: string;
    url: string;
    text: string;
};
/** Outcome of an index run for one workspace. */
export type IndexResult = {
    total: number;
    indexed: number;
    skipped: number;
};
/**
 * §15.1 indexer — embeds a workspace's tasks (title+description), docs
 * (title+plaintext), task comments (body), and the extracted text of
 * text-format task attachments into `knowledge_embeddings`.
 *
 * Upsert-by-source with content-hash skip: a source whose text is unchanged
 * since last run (same `content_hash`) and whose stored vector already has the
 * current embedder's dimension is left untouched, so re-indexing is cheap and
 * idempotent. Workspace-scoped throughout.
 *
 * Trigger (b) is a nightly @Cron that re-indexes every workspace — chosen over
 * per-write hooks so the whole feature lives inside the AI module (the tasks/
 * docs modules are reused read-only). The backfill endpoint
 * POST /workspaces/:id/knowledge/reindex (admin) is trigger (a).
 */
export declare class KnowledgeIndexerService {
    private readonly db;
    private readonly embeddings;
    private readonly r2?;
    private readonly logger;
    constructor(db: Db, embeddings: EmbeddingService, r2?: R2Service | undefined);
    /** Build the task/doc/comment URL used for citations (mirrors SearchService). */
    private taskUrl;
    /**
     * Gather every embeddable source in a workspace as normalized items. Public so
     * it can be unit-tested against a table-keyed DB mock without touching vectors.
     */
    collectSources(workspaceId: string): Promise<KnowledgeSourceItem[]>;
    /**
     * Gather every text/extractable attachment in a workspace as normalized items,
     * reading each object's bytes from R2 and extracting UTF-8 text.
     *
     * Access: an attachment inherits its parent task's container access, so it is
     * cited at the task URL and carries the same space/project scope — the same
     * `filterAccessibleHits` gate that scopes tasks/comments then scopes it too.
     *
     * Binaries (pdf/docx/images/zip/…) are skipped without any parser dependency
     * (see attachment-text.ts). R2-gated: with no storage configured this returns
     * `[]` so the rest of the reindex still runs. Best-effort per attachment — a
     * single unreadable object is logged and skipped, never fatal to the run.
     *
     * NOTE: extracting text from PDF/Office documents would require a heavy parser
     * lib (pdf-parse / mammoth / OCR) and is intentionally out of scope; only text
     * formats are indexed here.
     */
    collectAttachmentSources(workspaceId: string): Promise<KnowledgeSourceItem[]>;
    /**
     * Embed and upsert a workspace's content, skipping sources whose text is
     * unchanged (same content hash) and already stored at the current dimension.
     * Best-effort per source; never throws for one bad row.
     */
    indexWorkspaceContent(workspaceId: string): Promise<IndexResult>;
    /**
     * Nightly reindex of every workspace (trigger b). Best-effort and sequential
     * so it stays bounded; each workspace only re-embeds changed content.
     */
    reindexAllWorkspaces(): Promise<void>;
}
