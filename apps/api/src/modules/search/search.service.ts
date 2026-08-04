import { Injectable, Inject, Optional, OnModuleInit, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MeiliSearch, type Index } from 'meilisearch'
import { ilike, or, eq, and, asc, desc, inArray, gte, lte, sql, type SQL } from 'drizzle-orm'
import {
  tasks, taskAssignees, taskLabelAssignments, taskComments, taskAttachments, docs, lists, projects, spaces,
  savedSearches, users, workspaceMembers, chatChannels, chatChannelMembers, chatMessages,
  customFieldDefinitions, customFieldValues,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { R2Service } from '../../common/storage/r2.service'
import { resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'

// Every entity the search can return. The Postgres-only ones (user, comment,
// channel, message) belong here too — leaving them out meant a filter naming
// one was discarded as invalid and the search silently ran unfiltered.
export type SearchEntityType = 'task' | 'doc' | 'file' | 'user' | 'comment' | 'channel' | 'message'
/**
 * One search result. `sortedAt` is only present on the branches that carry a
 * timestamp (tasks, docs); files, people and messages leave it unset and sort
 * to the end under a timestamp sort.
 */
export type SearchHit = {
  id: string
  entityType: string
  title: string
  content: string
  url: string
  sortedAt?: Date | string | null
}

export type SearchFilters = {
  types?: SearchEntityType[]
  statusCategory?: 'open' | 'in_progress' | 'closed'
  priority?: 'urgent' | 'high' | 'normal' | 'low'
  assigneeId?: string
  /** §A2.4 — narrow to tasks a given member created. */
  creatorId?: string
  labelId?: string
  dueAfter?: Date
  dueBefore?: Date
  /**
   * §A2.4 — search hard-excluded archived rows, which is right by default and
   * wrong when you are hunting for something you archived last month.
   */
  includeArchived?: boolean
  /**
   * §A2.4 — "main sort bhi kar sakti hoon: last update, last created". Relevance
   * is the default; the other two order the merged result set by a timestamp
   * each branch now carries.
   */
  sort?: 'relevance' | 'updated' | 'created'
  // Custom-field value filter (Plan §11.2): narrows tasks to those whose value
  // for a given custom-field definition matches. `customFieldId` identifies the
  // per-project definition; `customFieldValue` is the stored value to match
  // (exact for dropdown/number/date/etc., ILIKE-contains for free-text types).
  customFieldId?: string
  customFieldValue?: string
}

// Free-text custom-field types get a case-insensitive "contains" match; every
// other type (dropdown, number, money, rating, date, checkbox) matches exactly.
const TEXT_LIKE_FIELD_TYPES = new Set(['text', 'url', 'email', 'phone'])

// The Meilisearch index schema is intentionally light-weight.
type SearchDoc = {
  id: string
  entityType: 'task' | 'doc' | 'file'
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
    // Uploaded "clips" live in R2 (not the DB), so file search reaches them
    // through the storage client. Optional so unit tests can construct the
    // service without wiring storage — clips are simply skipped when absent.
    @Optional() private readonly r2?: R2Service,
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

  /**
   * Index an uploaded file (task attachment) under the `file` entity type
   * (Plan §11.1). It carries the owning task's workspace/space so Meili's
   * workspace filter keeps it invisible to other workspaces — the same way
   * indexed tasks are scoped — and links back to the task it belongs to.
   */
  async indexTaskAttachment(
    attachment: { id: string; fileName: string; contentType: string; createdAt: Date },
    task: { id: string; listId: string },
    workspaceId: string,
    spaceId: string,
    projectId: string,
  ) {
    if (!this.enabled || !this.index) return
    await this.index.addDocuments([{
      id: `file-${attachment.id}`,
      entityType: 'file',
      workspaceId,
      listId: task.listId,
      spaceId,
      title: attachment.fileName,
      content: attachment.contentType,
      url: `/app/${workspaceId}/${spaceId}/${projectId}/${task.listId}?task=${task.id}`,
      createdAt: new Date(attachment.createdAt).getTime(),
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

    // Uploaded files (task attachments). Scoped through the owning task's
    // list → project → space so only this workspace's files are indexed.
    const attachmentRows = await this.db
      .select({
        attachment: taskAttachments,
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
      ...attachmentRows.map(({ attachment, taskId, listId, spaceId, projectId }) => ({
        id: `file-${attachment.id}`,
        entityType: 'file' as const,
        workspaceId,
        listId,
        spaceId,
        title: attachment.fileName,
        content: attachment.contentType,
        url: `/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${taskId}`,
        createdAt: new Date(attachment.createdAt).getTime(),
      })),
    ]
    if (payload.length) await this.index.addDocuments(payload)
    this.logger.log(`Reindexed workspace ${workspaceId}: ${payload.length} documents`)
  }

  async search(
    workspaceId: string,
    userId: string,
    query: string,
    limit = 10,
    filters: SearchFilters = {},
  ): Promise<Array<{ id: string; entityType: string; title: string; content: string; url: string }>> {
    const trimmed = query.trim()
    // §2 per-item privacy: private tasks are only searchable by their creator,
    // assignees, or a workspace manager. Computed once and applied to every
    // task-bearing branch (Postgres task hits, comment hits, attachment hits,
    // and as a post-filter over Meili task hits, which aren't visibility-indexed).
    const isManager = await resolveIsManager(this.db, workspaceId, userId)
    const hasCustomFieldFilter = Boolean(filters.customFieldId && filters.customFieldValue)
    const hasTaskFilter = Boolean(
      filters.statusCategory ||
        filters.priority ||
        filters.assigneeId ||
        filters.creatorId ||
        filters.labelId ||
        filters.dueAfter ||
        filters.dueBefore ||
        hasCustomFieldFilter,
    )
    const wantTasks = !filters.types || filters.types.includes('task')
    // Task-specific filters imply the caller wants tasks, so docs are excluded.
    const wantDocs = (!filters.types || filters.types.includes('doc')) && !hasTaskFilter
    // Uploaded files (task attachments + clips). Like docs they carry none of the
    // task-specific filters, so a task-filtered search excludes them (Plan §11.1).
    const wantFiles = (!filters.types || filters.types.includes('file')) && !hasTaskFilter

    // Nothing to match on at all → empty. (Filter-only searches are allowed.)
    if (!trimmed && !hasTaskFilter && !filters.types) return []

    // Meilisearch can only satisfy the text + entity-type filters — it doesn't
    // index status/priority/assignee, nor the archived flag. Fall back to
    // Postgres for those.
    // A timestamp sort needs updatedAt/createdAt, which the Meili documents do
    // not carry — so take the Postgres path rather than return an order that
    // silently ignores the request.
    const wantsTimeSort = filters.sort === 'updated' || filters.sort === 'created'
    if (this.enabled && this.index && trimmed && !hasTaskFilter && !filters.includeArchived && !wantsTimeSort) {
      const filterExpr = [`workspaceId = "${workspaceId}"`]
      // Narrow to every requested type, not just a lone one. With two or more
      // selected this used to push no filter at all, so Meili happily returned
      // the types the caller had just excluded. Types Meili does not index
      // (user, comment, channel, message) simply match nothing here and are
      // supplied by searchExtras instead.
      if (filters.types?.length) {
        filterExpr.push(`(${filters.types.map((t) => `entityType = "${t}"`).join(' OR ')})`)
      }
      const res = await this.index.search(trimmed, { filter: filterExpr, limit })
      const meiliHits = res.hits.map((h) => ({
        id: h.id,
        entityType: h.entityType,
        title: h.title,
        content: (h.content ?? '').slice(0, 200),
        url: h.url,
      }))
      // Meili indexes tasks/docs/files — add the Postgres-only entity types
      // (users, comments, channels, messages) for a general search.
      // Meili has no visibility field — drop private task hits the caller can't see.
      const safeMeili = await this.dropHiddenTaskHits(meiliHits, userId, isManager)
      const extras = await this.searchExtras(workspaceId, userId, `%${trimmed}%`, limit, isManager, filters.types)
      // Clips live in R2, never in Meili, so they're queried separately.
      const clipHits = wantFiles ? await this.searchClips(workspaceId, trimmed, limit) : []
      return this.merge(filters.sort, limit, [...safeMeili, ...extras, ...clipHits])
    }

    // Fallback / rich-filter path: Postgres ILIKE + structured filters.
    const like = trimmed ? `%${trimmed}%` : null

    const taskHits = wantTasks
      ? await (async () => {
          const conds: Array<SQL | undefined> = [
            eq(spaces.workspaceId, workspaceId),
            filters.includeArchived ? undefined : eq(tasks.isArchived, false),
            taskVisibilityFilter(this.db, userId, isManager),
          ]
          if (like) conds.push(or(ilike(tasks.title, like), ilike(tasks.description, like)))
          if (filters.statusCategory) conds.push(eq(tasks.statusCategory, filters.statusCategory))
          if (filters.priority) conds.push(eq(tasks.priority, filters.priority))
          if (filters.creatorId) conds.push(eq(tasks.createdById, filters.creatorId))
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
          if (hasCustomFieldFilter) {
            conds.push(
              await this.customFieldValueCondition(
                workspaceId,
                filters.customFieldId!,
                filters.customFieldValue!,
              ),
            )
          }
          return this.db
            .select({ id: tasks.id, title: tasks.title, description: tasks.description, listId: tasks.listId, projectId: projects.id, spaceId: spaces.id, updatedAt: tasks.updatedAt, createdAt: tasks.createdAt })
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
            filters.includeArchived ? undefined : eq(docs.isArchived, false),
            ...(like ? [or(ilike(docs.title, like), ilike(docs.plaintext, like))] : []),
          ))
          .orderBy(desc(docs.updatedAt))
          .limit(limit)
      : []

    // Uploaded files: task attachments (Postgres, access-scoped) + clips (R2).
    const fileHits = wantFiles ? await this.searchTaskAttachments(workspaceId, userId, isManager, like, limit) : []
    const clipHits = wantFiles ? await this.searchClips(workspaceId, trimmed, limit) : []

    // Extras only for a general text search (no type/task-specific filter).
    const extras = like ? await this.searchExtras(workspaceId, userId, like, limit, isManager, filters.types) : []

    return this.merge(filters.sort, limit, [
      ...taskHits.map((t) => ({
        id: `task-${t.id}`,
        entityType: 'task',
        title: t.title,
        content: (t.description ?? '').slice(0, 200),
        url: `/app/${workspaceId}/${t.spaceId}/${t.projectId}/${t.listId}?task=${t.id}`,
        sortedAt: (filters.sort === 'created' ? t.createdAt : t.updatedAt) ?? null,
      })),
      ...docHits.map((d) => ({
        id: `doc-${d.id}`,
        entityType: 'doc',
        title: d.title,
        content: d.plaintext.slice(0, 200),
        url: `/app/${workspaceId}/docs?doc=${d.id}`,
        sortedAt: (filters.sort === 'created' ? d.createdAt : d.updatedAt) ?? null,
      })),
      ...fileHits,
      ...clipHits,
      ...extras,
    ])
  }

  /**
   * Order the merged hits, then cut the list to the size the caller asked for.
   *
   * Both branches build their result by concatenating several independently
   * limited queries, so `limit` was silently behaving as "per source" rather
   * than a total: the same query returned 5 hits sorted by relevance and 16
   * sorted by date, because the date path fans out over five Postgres queries
   * and the relevance path mostly hits Meili. Changing the order of a list
   * must not change what is in it.
   *
   * The cut happens after the sort, never before — truncating first would keep
   * an arbitrary subset and then order that, which is not the top N.
   */
  private merge(sort: SearchFilters['sort'], limit: number, hits: SearchHit[]): SearchHit[] {
    return this.applySort(sort, hits).slice(0, limit)
  }

  /**
   * Order the merged result set. Relevance is whatever each branch's own query
   * returned, so we leave it alone; the timestamp modes sort across branches,
   * putting hits with no timestamp (files, people, messages) last rather than
   * letting an absent date read as "oldest".
   */
  private applySort(sort: SearchFilters['sort'], hits: SearchHit[]): SearchHit[] {
    if (!sort || sort === 'relevance') return hits
    const at = (h: SearchHit) => (h.sortedAt ? new Date(h.sortedAt).getTime() : null)
    return [...hits].sort((a, b) => {
      const x = at(a), y = at(b)
      if (x === null && y === null) return 0
      if (x === null) return 1
      if (y === null) return -1
      return y - x
    })
  }

  /**
   * Drop private task hits (from the Meili index, which carries no visibility
   * field) that the caller may not see. Non-task hits pass through untouched.
   */
  private async dropHiddenTaskHits<T extends { id: string; entityType: string }>(
    hits: T[],
    userId: string,
    isManager: boolean,
  ): Promise<T[]> {
    if (isManager) return hits
    const taskIds = hits.filter((h) => h.entityType === 'task').map((h) => h.id)
    if (taskIds.length === 0) return hits
    const visible = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(inArray(tasks.id, taskIds), taskVisibilityFilter(this.db, userId, false)))
    const ok = new Set(visible.map((r) => r.id))
    return hits.filter((h) => h.entityType !== 'task' || ok.has(h.id))
  }

  /** Search users, comments, channels, and messages (Plan §11.1). */
  /**
   * Users, comments, channels and messages — the entity types Meilisearch does
   * not index. `types` narrows which of them to run; passing a filter that
   * names none of them short-circuits to nothing, which is why the caller can
   * hand its type chips straight through instead of skipping this entirely.
   */
  private async searchExtras(
    workspaceId: string,
    userId: string,
    like: string,
    limit: number,
    isManager = false,
    types?: string[],
  ) {
    const wants = (t: string) => !types || types.includes(t)
    if (!wants('user') && !wants('comment') && !wants('channel') && !wants('message')) return []
    // Chat search must respect channel access (Plan §6): a user may only see
    // hits from public channels or channels they belong to — never from private
    // channels or DMs they're not a member of. Compute their channels once and
    // scope both the channel-name and message-body searches to accessible ones.
    const memberRows = await this.db
      .select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.userId, userId))
    const memberChannelIds = memberRows.map((r) => r.channelId)
    const publicChannel = and(eq(chatChannels.isPrivate, false), eq(chatChannels.isDm, false))
    const accessibleChannel =
      memberChannelIds.length > 0 ? or(publicChannel, inArray(chatChannels.id, memberChannelIds)) : publicChannel

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
        .where(and(eq(spaces.workspaceId, workspaceId), ilike(taskComments.body, like), taskVisibilityFilter(this.db, userId, isManager)))
        .orderBy(desc(taskComments.createdAt))
        .limit(limit),
      this.db
        .select({ id: chatChannels.id, name: chatChannels.name })
        .from(chatChannels)
        .where(and(eq(chatChannels.workspaceId, workspaceId), ilike(chatChannels.name, like), accessibleChannel))
        .limit(limit),
      this.db
        .select({ id: chatMessages.id, body: chatMessages.body, channelId: chatMessages.channelId })
        .from(chatMessages)
        .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
        .where(and(eq(chatChannels.workspaceId, workspaceId), ilike(chatMessages.body, like), accessibleChannel))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit),
    ])
    return [
      ...(wants('user') ? userHits : []).map((u) => ({
        id: `user-${u.id}`, entityType: 'user', title: u.displayName || u.email, content: u.email,
        url: `/app/${workspaceId}/settings`,
      })),
      ...(wants('comment') ? commentHits : []).map((c) => ({
        id: `comment-${c.id}`, entityType: 'comment', title: `Comment on “${c.taskTitle}”`, content: c.body.slice(0, 200),
        url: `/app/${workspaceId}/${c.spaceId}/${c.projectId}/${c.listId}?task=${c.taskId}`,
      })),
      ...(wants('channel') ? channelHits : []).map((c) => ({
        id: `channel-${c.id}`, entityType: 'channel', title: `#${c.name}`, content: '',
        url: `/app/${workspaceId}/chat?channel=${c.id}`,
      })),
      ...(wants('message') ? messageHits : []).map((m) => ({
        id: `message-${m.id}`, entityType: 'message', title: 'Chat message', content: m.body.slice(0, 200),
        url: `/app/${workspaceId}/chat?channel=${m.channelId}&message=${m.id}`,
      })),
    ]
  }

  /**
   * Search uploaded files stored as task attachments (Plan §11.1). Access is
   * scoped exactly like task and comment search: an attachment is reachable only
   * through its task → list → project → space, and that space must belong to the
   * caller's workspace. An attachment whose task lives in another workspace (or
   * any container the caller can't reach) never satisfies the join, so it can
   * never leak into these results. Matches the file name and its content type.
   */
  private async searchTaskAttachments(
    workspaceId: string,
    userId: string,
    isManager: boolean,
    like: string | null,
    limit: number,
  ): Promise<Array<{ id: string; entityType: string; title: string; content: string; url: string }>> {
    const conds: Array<SQL | undefined> = [
      eq(spaces.workspaceId, workspaceId),
      taskVisibilityFilter(this.db, userId, isManager),
    ]
    if (like) conds.push(or(ilike(taskAttachments.fileName, like), ilike(taskAttachments.contentType, like)))
    const rows = await this.db
      .select({
        id: taskAttachments.id,
        fileName: taskAttachments.fileName,
        contentType: taskAttachments.contentType,
        taskId: tasks.id,
        listId: tasks.listId,
        projectId: projects.id,
        spaceId: spaces.id,
      })
      .from(taskAttachments)
      .innerJoin(tasks, eq(tasks.id, taskAttachments.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(...conds))
      .orderBy(desc(taskAttachments.createdAt))
      .limit(limit)
    return rows.map((f) => ({
      id: `file-${f.id}`,
      entityType: 'file',
      title: f.fileName,
      content: f.contentType,
      url: `/app/${workspaceId}/${f.spaceId}/${f.projectId}/${f.listId}?task=${f.taskId}`,
    }))
  }

  /**
   * Search uploaded screen-recording "clips" (Plan §11.1). Clips are stored as
   * R2 objects under `workspaces/<id>/clips/`, not in the DB, so we match on the
   * file name embedded in each object key. The workspace prefix is the entire
   * access boundary — a clip is only ever listed under its own workspace, so it
   * cannot cross workspaces. Best-effort: any storage error (or R2 not being
   * configured) yields no clip hits rather than failing the whole search.
   */
  private async searchClips(
    workspaceId: string,
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; entityType: string; title: string; content: string; url: string }>> {
    const r2 = this.r2
    const needle = query.trim().toLowerCase()
    if (!needle || !r2 || !r2.configured) return []
    const hits: Array<{ id: string; entityType: string; title: string; content: string; url: string }> = []
    try {
      const listed = await r2.listObjects(`workspaces/${workspaceId}/clips/`, 200)
      for (const obj of listed.Contents ?? []) {
        if (!obj.Key) continue
        const fileName = obj.Key.split('/').pop() ?? ''
        // Keys are `<timestamp>-<sanitizedFileName>`; drop the timestamp prefix
        // so the searchable label matches what the recorder named the clip.
        const label = fileName.replace(/^\d+-/, '')
        if (!label.toLowerCase().includes(needle)) continue
        hits.push({
          id: `file-${obj.Key}`,
          entityType: 'file',
          title: label,
          content: 'Clip',
          url: `/app/${workspaceId}/clips`,
        })
        if (hits.length >= limit) break
      }
    } catch {
      // Storage is best-effort; a listing failure just yields no clip hits.
    }
    return hits
  }

  // ── Custom-field value filter (Plan §11.2) ──────────────────────────────────

  /**
   * List every custom-field definition reachable in a workspace (across all its
   * spaces/projects) so the search UI can offer them as a filter. Workspace
   * ownership is enforced via the project → space → workspace join.
   */
  async listWorkspaceCustomFields(workspaceId: string) {
    return this.db
      .select({
        id: customFieldDefinitions.id,
        name: customFieldDefinitions.name,
        type: customFieldDefinitions.type,
        options: customFieldDefinitions.options,
        projectId: customFieldDefinitions.projectId,
        projectName: projects.name,
      })
      .from(customFieldDefinitions)
      .innerJoin(projects, eq(projects.id, customFieldDefinitions.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(spaces.workspaceId, workspaceId))
      .orderBy(asc(projects.name), asc(customFieldDefinitions.position), asc(customFieldDefinitions.name))
  }

  /**
   * Build the SQL condition that restricts `tasks.id` to those whose stored
   * value for the given custom-field definition matches `value`. The field's
   * type decides the operator: free-text types use a case-insensitive contains
   * (ILIKE), everything else uses exact equality on the JSON scalar (`value->>'v'`).
   * An unknown/foreign field id matches nothing, keeping results workspace-scoped.
   */
  private async customFieldValueCondition(workspaceId: string, fieldId: string, value: string): Promise<SQL> {
    const [def] = await this.db
      .select({ type: customFieldDefinitions.type })
      .from(customFieldDefinitions)
      .innerJoin(projects, eq(projects.id, customFieldDefinitions.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(customFieldDefinitions.id, fieldId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!def) return sql`false`
    const valueExpr = sql`${customFieldValues.value} ->> 'v'`
    const match = TEXT_LIKE_FIELD_TYPES.has(def.type)
      ? sql`${valueExpr} ILIKE ${`%${value}%`}`
      : sql`${valueExpr} = ${value}`
    return inArray(
      tasks.id,
      this.db
        .select({ taskId: customFieldValues.taskId })
        .from(customFieldValues)
        .where(and(eq(customFieldValues.fieldId, fieldId), match)),
    )
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
