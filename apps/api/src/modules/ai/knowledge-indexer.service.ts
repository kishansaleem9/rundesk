import { Injectable, Inject, Optional, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, eq } from 'drizzle-orm'
import {
  knowledgeEmbeddings,
  tasks,
  docs,
  taskComments,
  taskAttachments,
  lists,
  projects,
  spaces,
  workspaces,
  meetings,
  type KnowledgeSourceType,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { R2Service } from '../../common/storage/r2.service'
import { EmbeddingService } from './embedding.service'
import { contentHash } from './embedding'
import {
  ATTACHMENT_TEXT_CAP,
  MAX_ATTACHMENT_BYTES,
  extractAttachmentText,
  isExtractableAttachment,
} from './attachment-text'
import { isLinkAttachmentKey } from '../tasks/task-object-keys'

/** A piece of workspace content to embed, resolved to its citation shape. */
export type KnowledgeSourceItem = {
  sourceType: KnowledgeSourceType
  sourceId: string
  title: string
  url: string
  text: string
}

/** Outcome of an index run for one workspace. */
export type IndexResult = { total: number; indexed: number; skipped: number }

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
@Injectable()
export class KnowledgeIndexerService {
  private readonly logger = new Logger(KnowledgeIndexerService.name)

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly embeddings: EmbeddingService,
    // Attachment CONTENTS live in R2; the indexer reads their bytes to extract
    // text. @Optional so the many unit tests that construct
    // `new KnowledgeIndexerService(db, embeddings)` keep compiling; injected in
    // production (StorageModule is @Global). When absent/unconfigured, attachment
    // indexing is skipped gracefully and the rest of the reindex is unaffected.
    @Optional() private readonly r2?: R2Service,
  ) {}

  /** Build the task/doc/comment URL used for citations (mirrors SearchService). */
  private taskUrl(workspaceId: string, spaceId: string, projectId: string, listId: string, taskId: string): string {
    return `/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${taskId}`
  }

  /**
   * Gather every embeddable source in a workspace as normalized items. Public so
   * it can be unit-tested against a table-keyed DB mock without touching vectors.
   */
  async collectSources(workspaceId: string): Promise<KnowledgeSourceItem[]> {
    const items: KnowledgeSourceItem[] = []

    const taskRows = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        listId: tasks.listId,
        spaceId: spaces.id,
        projectId: projects.id,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false)))

    for (const t of taskRows) {
      items.push({
        sourceType: 'task',
        sourceId: t.id,
        title: t.title,
        url: this.taskUrl(workspaceId, t.spaceId, t.projectId, t.listId, t.id),
        text: `${t.title}\n${t.description ?? ''}`.trim(),
      })
    }

    const docRows = await this.db
      .select({ id: docs.id, title: docs.title, plaintext: docs.plaintext })
      .from(docs)
      .where(and(eq(docs.workspaceId, workspaceId), eq(docs.isArchived, false)))

    for (const d of docRows) {
      items.push({
        sourceType: 'doc',
        sourceId: d.id,
        title: d.title,
        url: `/app/${workspaceId}/docs?doc=${d.id}`,
        text: `${d.title}\n${d.plaintext ?? ''}`.trim(),
      })
    }

    /*
     * §G14-15 — meeting notes.
     *
     * Indexed on the notes, not the title: a meeting called "Weekly sync"
     * tells retrieval nothing, and what somebody wants back is the decision
     * inside it. A meeting with no notes is skipped rather than embedded as a
     * bare heading — a vector for a title alone matches everything vaguely
     * organisational and answers nothing.
     */
    const meetingRows = await this.db
      .select({ id: meetings.id, title: meetings.title, notes: meetings.notes })
      .from(meetings)
      .where(eq(meetings.workspaceId, workspaceId))

    for (const m of meetingRows) {
      const notes = (m.notes ?? '').trim()
      if (!notes) continue
      items.push({
        sourceType: 'meeting',
        sourceId: m.id,
        title: m.title,
        url: `/app/${workspaceId}/meetings?meeting=${m.id}`,
        text: `${m.title}\n${notes}`.trim(),
      })
    }

    const commentRows = await this.db
      .select({
        id: taskComments.id,
        body: taskComments.body,
        taskId: tasks.id,
        taskTitle: tasks.title,
        listId: tasks.listId,
        spaceId: spaces.id,
        projectId: projects.id,
      })
      .from(taskComments)
      .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(spaces.workspaceId, workspaceId))

    for (const c of commentRows) {
      const body = (c.body ?? '').trim()
      if (!body) continue
      items.push({
        sourceType: 'comment',
        sourceId: c.id,
        title: `Comment on ${c.taskTitle}`,
        url: this.taskUrl(workspaceId, c.spaceId, c.projectId, c.listId, c.taskId),
        text: body,
      })
    }

    return items
  }

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
  async collectAttachmentSources(workspaceId: string): Promise<KnowledgeSourceItem[]> {
    if (!this.r2?.configured) {
      this.logger.debug(`Attachment indexing skipped for workspace ${workspaceId}: R2 not configured`)
      return []
    }
    const r2 = this.r2

    const attachmentRows = await this.db
      .select({
        id: taskAttachments.id,
        fileName: taskAttachments.fileName,
        contentType: taskAttachments.contentType,
        storageKey: taskAttachments.storageKey,
        sizeBytes: taskAttachments.sizeBytes,
        taskId: tasks.id,
        listId: tasks.listId,
        spaceId: spaces.id,
        projectId: projects.id,
      })
      .from(taskAttachments)
      .innerJoin(tasks, eq(tasks.id, taskAttachments.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false)))

    const items: KnowledgeSourceItem[] = []
    let failed = 0
    for (const a of attachmentRows) {
      // Skip non-text binaries cleanly (no parser dependency).
      if (!isExtractableAttachment(a.contentType)) continue
      // A linked attachment has no object in the bucket to read — its key IS
      // the URL — so fetching it only ever failed, and logged every link as
      // "unreadable" on every pass.
      if (isLinkAttachmentKey(a.storageKey)) continue
      // Don't pull a very large object fully into memory just to truncate it.
      if (typeof a.sizeBytes === 'number' && a.sizeBytes > MAX_ATTACHMENT_BYTES) continue
      try {
        const bytes = await r2.getObject(a.storageKey)
        const text = extractAttachmentText(bytes, a.contentType, ATTACHMENT_TEXT_CAP)
        if (!text) continue
        items.push({
          sourceType: 'attachment',
          sourceId: a.id,
          title: a.fileName,
          url: this.taskUrl(workspaceId, a.spaceId, a.projectId, a.listId, a.taskId),
          text,
        })
      } catch (err) {
        failed++
        this.logger.warn(`Failed to read attachment ${a.id} (${a.fileName}) from R2 — ${(err as Error).message}`)
      }
    }
    if (failed > 0) {
      this.logger.warn(`Attachment indexing for workspace ${workspaceId}: ${failed} attachment(s) unreadable`)
    }
    return items
  }

  /**
   * Embed and upsert a workspace's content, skipping sources whose text is
   * unchanged (same content hash) and already stored at the current dimension.
   * Best-effort per source; never throws for one bad row.
   */
  async indexWorkspaceContent(workspaceId: string): Promise<IndexResult> {
    // Tasks/docs/comments (from the live tables) plus text attachments (bytes
    // read from R2). Both trigger (a) /reindex and trigger (b) the nightly cron
    // flow through here, so attachments are indexed by both.
    const items = [
      ...(await this.collectSources(workspaceId)),
      ...(await this.collectAttachmentSources(workspaceId)),
    ]

    // Existing rows keyed by "type:id" → { contentHash, dim } for skip decisions.
    const existingRows = await this.db
      .select({
        sourceType: knowledgeEmbeddings.sourceType,
        sourceId: knowledgeEmbeddings.sourceId,
        contentHash: knowledgeEmbeddings.contentHash,
        dim: knowledgeEmbeddings.dim,
      })
      .from(knowledgeEmbeddings)
      .where(eq(knowledgeEmbeddings.workspaceId, workspaceId))
    const existing = new Map<string, { contentHash: string; dim: number }>()
    for (const r of existingRows) existing.set(`${r.sourceType}:${r.sourceId}`, { contentHash: r.contentHash, dim: r.dim })

    // Local embedder has a known fixed dim; the API path can't be checked
    // without embedding, so skip on hash alone there (its dim is model-stable).
    const expectedDim = this.embeddings.usesApi() ? null : this.embeddings.dim

    let indexed = 0
    let skipped = 0
    for (const item of items) {
      const hash = contentHash(item.text)
      const prev = existing.get(`${item.sourceType}:${item.sourceId}`)
      if (prev && prev.contentHash === hash && (expectedDim === null || prev.dim === expectedDim)) {
        skipped++
        continue
      }
      try {
        const { vector, dim } = await this.embeddings.embed(item.text)
        await this.db
          .insert(knowledgeEmbeddings)
          .values({
            workspaceId,
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            title: item.title,
            url: item.url,
            contentHash: hash,
            embedding: vector,
            dim,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [knowledgeEmbeddings.sourceType, knowledgeEmbeddings.sourceId],
            set: {
              workspaceId,
              title: item.title,
              url: item.url,
              contentHash: hash,
              embedding: vector,
              dim,
              updatedAt: new Date(),
            },
          })
        indexed++
      } catch (err) {
        this.logger.warn(`Failed to index ${item.sourceType}:${item.sourceId} — ${(err as Error).message}`)
      }
    }

    this.logger.log(`Indexed workspace ${workspaceId}: ${indexed} embedded, ${skipped} unchanged (${items.length} sources)`)
    return { total: items.length, indexed, skipped }
  }

  /**
   * Nightly reindex of every workspace (trigger b). Best-effort and sequential
   * so it stays bounded; each workspace only re-embeds changed content.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'knowledge-reindex-nightly' })
  async reindexAllWorkspaces(): Promise<void> {
    const rows = await this.db.select({ id: workspaces.id }).from(workspaces)
    for (const w of rows) {
      try {
        await this.indexWorkspaceContent(w.id)
      } catch (err) {
        this.logger.warn(`Nightly reindex failed for workspace ${w.id} — ${(err as Error).message}`)
      }
    }
  }
}
