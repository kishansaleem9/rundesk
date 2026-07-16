import { Injectable, Inject, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, eq } from 'drizzle-orm'
import {
  knowledgeEmbeddings,
  tasks,
  docs,
  taskComments,
  lists,
  projects,
  spaces,
  workspaces,
  type KnowledgeSourceType,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { EmbeddingService } from './embedding.service'
import { contentHash } from './embedding'

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
 * (title+plaintext), and task comments (body) into `knowledge_embeddings`.
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
   * Embed and upsert a workspace's content, skipping sources whose text is
   * unchanged (same content hash) and already stored at the current dimension.
   * Best-effort per source; never throws for one bad row.
   */
  async indexWorkspaceContent(workspaceId: string): Promise<IndexResult> {
    const items = await this.collectSources(workspaceId)

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
