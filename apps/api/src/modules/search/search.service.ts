import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MeiliSearch, type Index } from 'meilisearch'
import { ilike, or, eq, and, desc, inArray, gte, lte, type SQL } from 'drizzle-orm'
import {
  tasks, taskAssignees, taskLabelAssignments, taskComments, docs, lists, projects, spaces,
  savedSearches, users, workspaceMembers, chatChannels, chatMessages,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

export type SearchEntityType = 'task' | 'doc'
export type SearchFilters = {
  types?: SearchEntityType[]
  statusCategory?: 'open' | 'in_progress' | 'closed'
  priority?: 'urgent' | 'high' | 'normal' | 'low'
  assigneeId?: string
  labelId?: string
  dueAfter?: Date
  dueBefore?: Date
}

// The Meilisearch index schema is intentionally light-weight.
type SearchDoc = {
  id: string
  entityType: 'task' | 'doc'
  workspaceId: string
  title: string
  content: string
  listId?: string
  spaceId?: string
  url: string
  createdAt: number
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger('SearchService')
  private client?: MeiliSearch
  private index?: Index<SearchDoc>
  private enabled = false

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    const host = this.config.get<string>('MEILISEARCH_URL') ?? this.config.get<string>('MEILI_HOST')
    const apiKey = this.config.get<string>('MEILISEARCH_MASTER_KEY') ?? this.config.get<string>('MEILI_MASTER_KEY')
    if (!host) {
      this.logger.warn('MEILISEARCH_URL not set - falling back to Postgres ILIKE search')
      return
    }
    try {
      this.client = new MeiliSearch({ host, apiKey })
      this.index = this.client.index<SearchDoc>('rundesk')
      // Ensure index exists (non-fatal on failure)
      await this.client.createIndex('rundesk', { primaryKey: 'id' }).catch(() => {})
      await this.index.updateSettings({
        searchableAttributes: ['title', 'content'],
        filterableAttributes: ['entityType', 'workspaceId', 'listId', 'spaceId'],
        sortableAttributes: ['createdAt'],
      })
      this.enabled = true
      this.logger.log(`Meilisearch connected at ${host}`)
    } catch (err) {
      this.logger.warn(`Meilisearch init failed: ${(err as Error).message}`)
    }
  }

  async indexTask(task: { id: string; title: string; description: string | null; listId: string; createdAt: Date }, workspaceId: string, spaceId: string, projectId: string) {
    if (!this.enabled || !this.index) return
    await this.index.addDocuments([{
      id: `task-${task.id}`,
      entityType: 'task',
      workspaceId,
      listId: task.listId,
      spaceId,
      title: task.title,
      content: task.description ?? '',
      url: `/app/${workspaceId}/${spaceId}/${projectId}/${task.listId}?task=${task.id}`,
      createdAt: new Date(task.createdAt).getTime(),
    }])
  }

  async indexDoc(doc: { id: string; title: string; plaintext: string; workspaceId: string; spaceId: string | null; createdAt: Date }) {
    if (!this.enabled || !this.index) return
    await this.index.addDocuments([{
      id: `doc-${doc.id}`,
      entityType: 'doc',
      workspaceId: doc.workspaceId,
      spaceId: doc.spaceId ?? undefined,
      title: doc.title,
      content: doc.plaintext,
      url: `/app/${doc.workspaceId}/docs?doc=${doc.id}`,
      createdAt: new Date(doc.createdAt).getTime(),
    }])
  }

  async reindexWorkspace(workspaceId: string) {
    if (!this.enabled || !this.index) return
    const taskRows = await this.db
      .select({
        task: tasks,
        spaceId: spaces.id,
        projectId: projects.id,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false)))

    const docRows = await this.db.select().from(docs).where(and(eq(docs.workspaceId, workspaceId), eq(docs.isArchived, false)))

    const payload: SearchDoc[] = [
      ...taskRows.map(({ task, spaceId, projectId }) => ({
        id: `task-${task.id}`,
        entityType: 'task' as const,
        workspaceId,
        listId: task.listId,
        spaceId,
        title: task.title,
        content: task.description ?? '',
        url: `/app/${workspaceId}/${spaceId}/${projectId}/${task.listId}?task=${task.id}`,
        createdAt: new Date(task.createdAt).getTime(),
      })),
      ...docRows.map((d) => ({
        id: `doc-${d.id}`,
        entityType: 'doc' as const,
        workspaceId,
        spaceId: d.spaceId ?? undefined,
        title: d.title,
        content: d.plaintext,
        url: `/app/${workspaceId}/docs?doc=${d.id}`,
        createdAt: new Date(d.createdAt).getTime(),
      })),
    ]
    if (payload.length) await this.index.addDocuments(payload)
    this.logger.log(`Reindexed workspace ${workspaceId}: ${payload.length} documents`)
  }

  async search(
    workspaceId: string,
    query: string,
    limit = 10,
    filters: SearchFilters = {},
  ): Promise<Array<{ id: string; entityType: string; title: string; content: string; url: string }>> {
    const trimmed = query.trim()
    const hasTaskFilter = Boolean(
      filters.statusCategory ||
        filters.priority ||
        filters.assigneeId ||
        filters.labelId ||
        filters.dueAfter ||
        filters.dueBefore,
    )
    const wantTasks = !filters.types || filters.types.includes('task')
    // Task-specific filters imply the caller wants tasks, so docs are excluded.
    const wantDocs = (!filters.types || filters.types.includes('doc')) && !hasTaskFilter

    // Nothing to match on at all → empty. (Filter-only searches are allowed.)
    if (!trimmed && !hasTaskFilter && !filters.types) return []

    // Meilisearch can only satisfy the text + entity-type filters — it doesn't
    // index status/priority/assignee. Fall back to Postgres for those.
    if (this.enabled && this.index && trimmed && !hasTaskFilter) {
      const filterExpr = [`workspaceId = "${workspaceId}"`]
      if (filters.types && filters.types.length === 1) {
        filterExpr.push(`entityType = "${filters.types[0]}"`)
      }
      const res = await this.index.search(trimmed, { filter: filterExpr, limit })
      const meiliHits = res.hits.map((h) => ({
        id: h.id,
        entityType: h.entityType,
        title: h.title,
        content: (h.content ?? '').slice(0, 200),
        url: h.url,
      }))
      // Meili only indexes tasks/docs — add the other entity types from Postgres.
      const extras = filters.types ? [] : await this.searchExtras(workspaceId, `%${trimmed}%`, limit)
      return [...meiliHits, ...extras]
    }

    // Fallback / rich-filter path: Postgres ILIKE + structured filters.
    const like = trimmed ? `%${trimmed}%` : null

    const taskHits = wantTasks
      ? await (async () => {
          const conds: Array<SQL | undefined> = [
            eq(spaces.workspaceId, workspaceId),
            eq(tasks.isArchived, false),
          ]
          if (like) conds.push(or(ilike(tasks.title, like), ilike(tasks.description, like)))
          if (filters.statusCategory) conds.push(eq(tasks.statusCategory, filters.statusCategory))
          if (filters.priority) conds.push(eq(tasks.priority, filters.priority))
          if (filters.assigneeId) {
            conds.push(
              inArray(
                tasks.id,
                this.db
                  .select({ taskId: taskAssignees.taskId })
                  .from(taskAssignees)
                  .where(eq(taskAssignees.userId, filters.assigneeId)),
              ),
            )
          }
          if (filters.labelId) {
            conds.push(
              inArray(
                tasks.id,
                this.db
                  .select({ taskId: taskLabelAssignments.taskId })
                  .from(taskLabelAssignments)
                  .where(eq(taskLabelAssignments.labelId, filters.labelId)),
              ),
            )
          }
          if (filters.dueAfter) conds.push(gte(tasks.dueDate, filters.dueAfter))
          if (filters.dueBefore) conds.push(lte(tasks.dueDate, filters.dueBefore))
          return this.db
            .select({ id: tasks.id, title: tasks.title, description: tasks.description, listId: tasks.listId, projectId: projects.id, spaceId: spaces.id })
            .from(tasks)
            .innerJoin(lists, eq(lists.id, tasks.listId))
            .innerJoin(projects, eq(projects.id, lists.projectId))
            .innerJoin(spaces, eq(spaces.id, projects.spaceId))
            .where(and(...conds))
            .orderBy(desc(tasks.updatedAt))
            .limit(limit)
        })()
      : []

    const docHits = wantDocs
      ? await this.db
          .select()
          .from(docs)
          .where(and(
            eq(docs.workspaceId, workspaceId),
            eq(docs.isArchived, false),
            ...(like ? [or(ilike(docs.title, like), ilike(docs.plaintext, like))] : []),
          ))
          .orderBy(desc(docs.updatedAt))
          .limit(limit)
      : []

    // Extras only for a general text search (no type/task-specific filter).
    const extras = like && !filters.types ? await this.searchExtras(workspaceId, like, limit) : []

    return [
      ...taskHits.map((t) => ({
        id: `task-${t.id}`,
        entityType: 'task',
        title: t.title,
        content: (t.description ?? '').slice(0, 200),
        url: `/app/${workspaceId}/${t.spaceId}/${t.projectId}/${t.listId}?task=${t.id}`,
      })),
      ...docHits.map((d) => ({
        id: `doc-${d.id}`,
        entityType: 'doc',
        title: d.title,
        content: d.plaintext.slice(0, 200),
        url: `/app/${workspaceId}/docs?doc=${d.id}`,
      })),
      ...extras,
    ]
  }

  /** Search users, comments, channels, and messages (Plan §11.1). */
  private async searchExtras(workspaceId: string, like: string, limit: number) {
    const [userHits, commentHits, channelHits, messageHits] = await Promise.all([
      this.db
        .select({ id: users.id, displayName: users.displayName, email: users.email })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), or(ilike(users.displayName, like), ilike(users.email, like))))
        .limit(limit),
      this.db
        .select({ id: taskComments.id, body: taskComments.body, taskId: tasks.id, taskTitle: tasks.title, listId: tasks.listId, projectId: projects.id, spaceId: spaces.id })
        .from(taskComments)
        .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), ilike(taskComments.body, like)))
        .orderBy(desc(taskComments.createdAt))
        .limit(limit),
      this.db
        .select({ id: chatChannels.id, name: chatChannels.name })
        .from(chatChannels)
        .where(and(eq(chatChannels.workspaceId, workspaceId), ilike(chatChannels.name, like)))
        .limit(limit),
      this.db
        .select({ id: chatMessages.id, body: chatMessages.body, channelId: chatMessages.channelId })
        .from(chatMessages)
        .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
        .where(and(eq(chatChannels.workspaceId, workspaceId), ilike(chatMessages.body, like)))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit),
    ])
    return [
      ...userHits.map((u) => ({
        id: `user-${u.id}`, entityType: 'user', title: u.displayName || u.email, content: u.email,
        url: `/app/${workspaceId}/settings`,
      })),
      ...commentHits.map((c) => ({
        id: `comment-${c.id}`, entityType: 'comment', title: `Comment on “${c.taskTitle}”`, content: c.body.slice(0, 200),
        url: `/app/${workspaceId}/${c.spaceId}/${c.projectId}/${c.listId}?task=${c.taskId}`,
      })),
      ...channelHits.map((c) => ({
        id: `channel-${c.id}`, entityType: 'channel', title: `#${c.name}`, content: '',
        url: `/app/${workspaceId}/chat?channel=${c.id}`,
      })),
      ...messageHits.map((m) => ({
        id: `message-${m.id}`, entityType: 'message', title: 'Chat message', content: m.body.slice(0, 200),
        url: `/app/${workspaceId}/chat?channel=${m.channelId}&message=${m.id}`,
      })),
    ]
  }

  // ── Saved search presets (Plan §11.2) ───────────────────────────────────────

  async listSavedSearches(workspaceId: string, userId: string) {
    return this.db
      .select()
      .from(savedSearches)
      .where(and(eq(savedSearches.workspaceId, workspaceId), eq(savedSearches.userId, userId)))
      .orderBy(desc(savedSearches.updatedAt))
  }

  async createSavedSearch(
    workspaceId: string,
    userId: string,
    name: string,
    query: string | null,
    filters: Record<string, unknown>,
  ) {
    const trimmed = name?.trim()
    if (!trimmed) throw new Error('A preset name is required')
    const [row] = await this.db
      .insert(savedSearches)
      .values({ workspaceId, userId, name: trimmed.slice(0, 80), query: query || null, filters: filters ?? {} })
      .onConflictDoUpdate({
        target: [savedSearches.userId, savedSearches.workspaceId, savedSearches.name],
        set: { query: query || null, filters: filters ?? {}, updatedAt: new Date() },
      })
      .returning()
    return row
  }

  async deleteSavedSearch(id: string, userId: string) {
    await this.db
      .delete(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
    return { ok: true }
  }
}
