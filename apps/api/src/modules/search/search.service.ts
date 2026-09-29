import { Injectable, Inject, Optional, OnModuleInit, Logger, ForbiddenException } from '@nestjs/common'
import { DRIVE_SEARCH_SCOPE, grantCoversWholeDrive } from './drive-scope'
import {
  SEARCH_SOURCES,
  SOURCE_PROVIDER,
  SOURCE_SCOPE,
  grantCoversSource,
  type SearchSource,
} from './sources'
import { ConfigService } from '@nestjs/config'
import { MeiliSearch, type Index } from 'meilisearch'
import { ilike, or, eq, and, asc, desc, inArray, notInArray, gte, lte, sql, type SQL } from 'drizzle-orm'
import {
  tasks, taskAssignees, taskLabelAssignments, taskComments, taskAttachments, docs, lists, projects, spaces,
  folders, savedSearches, users, workspaceMembers, chatChannels, chatMessages,
  workspaceIntegrationConnections,
  customFieldDefinitions, customFieldValues, meetings, searchEngagement,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { R2Service } from '../../common/storage/r2.service'
import { safeFetch } from '../../common/http/safe-fetch'
import {
  resolveIsManager,
  taskVisibilityFilter,
  listVisibilityFilter,
  folderVisibilityFilter,
} from '../../common/permissions/item-visibility'
import { containerVisibilityFilter, spaceVisibilityFilter, taskInReachFilter } from '../../common/permissions/container-access.guard-helper'
import { hiddenDocIds } from '../../common/permissions/doc-access'
import { readableChannelsFilter } from '../chat/channel-read-filter'
import { likeContaining } from '../../common/sql/like'

// Every entity the search can return. The Postgres-only ones (user, comment,
// channel, message) belong here too — leaving them out meant a filter naming
// one was discarded as invalid and the search silently ran unfiltered.
// §2 [02:03] — "let's suppose ke mujhe FOLDERS mein search karna hai, to folders
// yahan pe appear ho jayega". The containers are things you look for by name
// just as much as the tasks inside them, and they were not searchable at all.
export type SearchEntityType =
  | 'task' | 'doc' | 'file' | 'user' | 'comment' | 'channel' | 'message' | 'meeting'
  | 'folder' | 'list' | 'space'
  // §4 [04:20] — "Agar hum Google Drive se search karenge to woh humari Google
  // Drive se bhi cheezein dhoond ke mila ke de sakta hai."
  | 'drive'
  /*
   * §V2-11 `19:07` / [19:18] — "Main is se kahoongi meri Gmail pe jaa ke…".
   *
   * These two names existed in `FEDERATED_ENTITY_TYPES` and in the palette's
   * source strip, and in neither the accepted-type union nor any query path.
   * A source that can be chosen and cannot be answered is the confident zero
   * this audit is named after; a source that can be chosen and quietly answers
   * with somebody's tasks is worse.
   */
  | 'gmail'
  | 'sharepoint'
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
  /** §1.1 — narrow to one task type (Task, Milestone, …). */
  taskTypeId?: string
  dueAfter?: Date
  dueBefore?: Date
  /**
   * §2 [04:00] — "abhi hua tha yeh — last created date kya thi — dates ke
   * lehaz par". Distinct from the due dates above: when a thing was made, not
   * when it is owed. Sorting by created already existed; filtering did not.
   */
  createdAfter?: Date
  createdBefore?: Date
  /**
   * §2 [02:35] — "LOCATION ka matlab yeh hota hai ke woh kis space mein para
   * hai, ya kis list mein para hai." Which container it sits in.
   */
  spaceId?: string
  /**
   * A folder groups projects inside a space, so narrowing to one means
   * "anything under these projects" — the level between the two she named.
   */
  folderId?: string
  listId?: string
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
  sort?: 'relevance' | 'updated' | 'created' | 'trending' | 'trending_me'
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
//
// Both timestamps are indexed so Meili can order by either. Without updatedAt,
// a "last updated" sort had to fall back to Postgres, and the two engines match
// differently — Meili tokenises, Postgres does substring ILIKE — so the same
// query returned a different *set* depending only on how it was sorted.
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
  updatedAt: number
}

/** Meili sort expression for a timestamp mode; undefined when relevance is wanted. */
export function meiliSort(sort: SearchFilters['sort']): string[] | undefined {
  if (sort === 'updated') return ['updatedAt:desc']
  if (sort === 'created') return ['createdAt:desc']
  return undefined
}

/**
 * §G03-6 — the key an engagement row is counted under.
 *
 * A search hit's id is `"<type>-<rawId>"` and the engagement table keeps the
 * two in separate columns, so this is the one place the two spellings meet.
 * Split on the FIRST hyphen only: a uuid contains four more, and splitting on
 * all of them silently produces a key that matches nothing — a trending sort
 * that quietly scores everything zero and looks exactly like a sort nobody uses.
 */
function engagementKey(hitId: string): string {
  const at = hitId.indexOf('-')
  return at < 0 ? `:${hitId}` : `${hitId.slice(0, at)}:${hitId.slice(at + 1)}`
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
        sortableAttributes: ['createdAt', 'updatedAt'],
      })
      this.enabled = true
      this.logger.log(`Meilisearch connected at ${host}`)
    } catch (err) {
      this.logger.warn(`Meilisearch init failed: ${(err as Error).message}`)
    }
  }

  async indexTask(task: { id: string; title: string; description: string | null; listId: string; createdAt: Date; updatedAt?: Date | null }, workspaceId: string, spaceId: string, projectId: string) {
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
      // Fall back to createdAt rather than 0 — a document that sorts to the
      // epoch would look like the oldest thing in the workspace.
      updatedAt: new Date(task.updatedAt ?? task.createdAt).getTime(),
    }])
  }

  async indexDoc(doc: { id: string; title: string; plaintext: string; workspaceId: string; spaceId: string | null; createdAt: Date; updatedAt?: Date | null }) {
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
      updatedAt: new Date(doc.updatedAt ?? doc.createdAt).getTime(),
    }])
  }

  /**
   * Index an uploaded file (task attachment) under the `file` entity type
   * (Plan §11.1). It carries the owning task's workspace/space so Meili's
   * workspace filter keeps it invisible to other workspaces — the same way
   * indexed tasks are scoped — and links back to the task it belongs to.
   */
  /**
   * Take a task back out of the index.
   *
   * There was no removal path anywhere in the codebase: `indexTask` wrote on
   * create and on edit, and nothing ever deleted, so a binned task stayed in
   * Meili for good and the index only grew. Those documents are pure dead
   * weight — an archived task can never be returned from here, because a
   * search asking for archived work skips Meili entirely and goes to Postgres
   * — yet they still occupied the result pages that live work needed.
   *
   * Never fatal. Losing the index entry for something the caller has just
   * binned is not a reason to fail their delete; the read path filters against
   * Postgres regardless, so a document that outlives its task is stale rather
   * than dangerous.
   */
  async removeTask(taskId: string) {
    if (!this.enabled || !this.index) return
    await this.index.deleteDocument(`task-${taskId}`).catch(() => undefined)
  }

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
      // An uploaded file is never edited in place, so it was last "updated"
      // when it was uploaded.
      updatedAt: new Date(attachment.createdAt).getTime(),
    }])
  }

  /**
   * Rebuilding a workspace's index reads every task and doc in it and rewrites
   * the index: a manager's action, as the knowledge reindex is. Any member
   * could start it (measured, 201).
   */
  async reindexWorkspaceAs(workspaceId: string, actorId: string, actorRole?: string) {
    if (!(await resolveIsManager(this.db, workspaceId, actorId, actorRole))) {
      throw new ForbiddenException('Only a workspace manager can rebuild its search index')
    }
    return this.reindexWorkspace(workspaceId)
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
        updatedAt: new Date(task.updatedAt ?? task.createdAt).getTime(),
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
        updatedAt: new Date(d.updatedAt ?? d.createdAt).getTime(),
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
        updatedAt: new Date(attachment.createdAt).getTime(),
      })),
    ]
    /*
     * Clear this workspace's documents before writing the new ones.
     *
     * It only ever added, which meant "reindex" could not do the one thing the
     * word promises: make the index match reality. Anything already indexed
     * and no longer live — a task binned before removal-on-archive existed, a
     * doc deleted by a cascade — survived every reindex, and the only tool for
     * fixing a wrong index could not fix it.
     *
     * Scoped by filter so one workspace's repair never touches another's, and
     * awaited so the add below cannot race the delete and lose what it wrote.
     */
    await this.index
      .deleteDocuments({ filter: `workspaceId = "${workspaceId}"` })
      .then((task) => this.index?.waitForTask(task.taskUid, { timeOutMs: 60_000 }))
      .catch(() => undefined)
    if (payload.length) await this.index.addDocuments(payload)
    this.logger.log(`Reindexed workspace ${workspaceId}: ${payload.length} documents`)
    // Answers with the count, so whoever runs the repair can see it did something.
    return { indexed: payload.length }
  }

  async search(
    workspaceId: string,
    userId: string,
    query: string,
    limit = 10,
    filters: SearchFilters = {},
  ): Promise<Array<{ id: string; entityType: string; title: string; content: string; url: string }>> {
    const trimmed = query.trim()
    /*
     * §G03-6 — fetched once for the whole search, and only when a trending mode
     * is asked for: an extra grouped scan on every keystroke of every ordinary
     * search would be a real cost for a feature nobody switched on.
     */
    const trending =
      filters.sort === 'trending' || filters.sort === 'trending_me'
        ? await this.engagementScores(workspaceId, userId, filters.sort === 'trending_me')
        : undefined
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
        filters.taskTypeId ||
        filters.dueAfter ||
        filters.dueBefore ||
        // These belong here for the same reason as every line above it: Meili
        // indexes none of them, so a search carrying one has to take the
        // Postgres path. Leaving a filter out of this list does not error — it
        // routes to Meili, which ignores it and answers as though you had not
        // filtered at all. "The filter did nothing" is the failure mode.
        filters.createdAfter ||
        filters.createdBefore ||
        filters.spaceId ||
        filters.folderId ||
        filters.listId ||
        hasCustomFieldFilter,
    )
    const wantTasks = !filters.types || filters.types.includes('task')
    // Task-specific filters imply the caller wants tasks, so docs are excluded.
    const wantDocs = (!filters.types || filters.types.includes('doc')) && !hasTaskFilter
    // Uploaded files (task attachments + clips). Like docs they carry none of the
    // task-specific filters, so a task-filtered search excludes them (Plan §11.1).
    const wantFiles = (!filters.types || filters.types.includes('file')) && !hasTaskFilter
    // §4 — Drive carries none of the task-specific filters, so a task-filtered
    // search excludes it, exactly as docs and files are excluded above.
    const wantDrive = (!filters.types || filters.types.includes('drive')) && !hasTaskFilter
    // §V2-11 `19:07` — the other two federated sources, gated exactly as Drive
    // is. Written as three sibling lines rather than a loop so that a source
    // with a tab and no gate here is a compile error, not a silent omission.
    const wantGmail = (!filters.types || filters.types.includes('gmail')) && !hasTaskFilter
    const wantSharePoint =
      (!filters.types || filters.types.includes('sharepoint')) && !hasTaskFilter

    // Nothing to match on at all → empty. (Filter-only searches are allowed.)
    if (!trimmed && !hasTaskFilter && !filters.types) return []

    // Meilisearch can only satisfy the text + entity-type filters — it doesn't
    // index status/priority/assignee, nor the archived flag. Fall back to
    // Postgres for those.
    //
    // Sorting no longer forces that fallback. Both timestamps are indexed now,
    // so Meili orders every mode itself. Previously a date sort dropped to the
    // Postgres path, and because the two engines match differently — Meili
    // tokenises, Postgres does substring ILIKE — reordering a result list also
    // changed which rows were in it.
    let safeMeili: SearchHit[] | null = null
    if (this.enabled && this.index && trimmed && !hasTaskFilter && !filters.includeArchived) {
      const filterExpr = [`workspaceId = "${workspaceId}"`]
      // Narrow to every requested type, not just a lone one. With two or more
      // selected this used to push no filter at all, so Meili happily returned
      // the types the caller had just excluded. Types Meili does not index
      // (user, comment, channel, message) simply match nothing here and are
      // supplied by searchExtras instead.
      if (filters.types?.length) {
        filterExpr.push(`(${filters.types.map((t) => `entityType = "${t}"`).join(' OR ')})`)
      }
      /*
       * A Meilisearch that answered at boot and has gone since is not a reason
       * to fail the search. Only a failed init fell back: stopped under a
       * running API, every plain search answered 500 while a task-filtered one,
       * which takes the Postgres path, answered 200
       * (`found-29-sep/meili-gone-after-boot-fails-every-search`). This search
       * is answered from Postgres; the next one asks Meilisearch again.
       */
      safeMeili = await this.visibleMeiliHits(
        trimmed,
        filterExpr,
        filters.sort,
        limit,
        workspaceId,
        userId,
        isManager,
        Boolean(filters.includeArchived),
      ).catch((err: unknown) => {
        this.logger.warn(`Meilisearch search failed, answered from Postgres: ${(err as Error).message}`)
        return null
      })
    }
    if (safeMeili) {
      const extras = await this.searchExtras(workspaceId, userId, likeContaining(trimmed), limit, isManager, filters.types)
      // Clips live in R2, never in Meili, so they're queried separately.
      const clipHits = wantFiles ? await this.searchClips(workspaceId, trimmed, limit) : []
      const driveHits = wantDrive ? await this.searchDrive(workspaceId, trimmed, limit, userId) : []
      const gmailHits = wantGmail ? await this.searchGmail(workspaceId, trimmed, limit, userId) : []
      const sharePointHits = wantSharePoint
        ? await this.searchSharePoint(workspaceId, trimmed, limit, userId)
        : []
      return this.merge(
        filters.sort,
        limit,
        [...safeMeili, ...extras, ...clipHits, ...driveHits, ...gmailHits, ...sharePointHits],
        trending,
      )
    }

    // Fallback / rich-filter path: Postgres ILIKE + structured filters.
    // Literal: `%` and `_` are LIKE's wildcards, so "50%" searched as a pattern
    // found "500" too (found-28-sep/like-patterns-escaped-four-ways).
    const like = trimmed ? likeContaining(trimmed) : null

    const taskHits = wantTasks
      ? await (async () => {
          const conds: Array<SQL | undefined> = [
            eq(spaces.workspaceId, workspaceId),
            filters.includeArchived ? undefined : eq(tasks.isArchived, false),
            // The container rule and the private-item rule. Only the second
            // applied: measured, a member's search returned the task of a
            // private space they were refused (`workspace-read-access` §8).
            taskInReachFilter(this.db, workspaceId, userId, isManager),
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
          if (filters.taskTypeId) conds.push(eq(tasks.taskTypeId, filters.taskTypeId))
          if (filters.dueAfter) conds.push(gte(tasks.dueDate, filters.dueAfter))
          if (filters.dueBefore) conds.push(lte(tasks.dueDate, filters.dueBefore))
          if (filters.createdAfter) conds.push(gte(tasks.createdAt, filters.createdAfter))
          if (filters.createdBefore) conds.push(lte(tasks.createdAt, filters.createdBefore))
          // Location narrows by container. `spaceId` is already joined below.
          if (filters.listId) conds.push(eq(tasks.listId, filters.listId))
          if (filters.spaceId) conds.push(eq(spaces.id, filters.spaceId))
          // A folder sits between the space and the list: it groups projects,
          // and the task branch is already joined through projects to reach here.
          if (filters.folderId) conds.push(eq(projects.folderId, filters.folderId))
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

    // The doc rule (`doc-access.ts`); this branch had none at all.
    const hiddenDocs = wantDocs ? await hiddenDocIds(this.db, workspaceId, userId, isManager) : []
    const docHits = wantDocs
      ? await this.db
          .select()
          .from(docs)
          .where(and(
            eq(docs.workspaceId, workspaceId),
            filters.includeArchived ? undefined : eq(docs.isArchived, false),
            hiddenDocs.length ? notInArray(docs.id, hiddenDocs) : undefined,
            ...(like ? [or(ilike(docs.title, like), ilike(docs.plaintext, like))] : []),
          ))
          .orderBy(desc(docs.updatedAt))
          .limit(limit)
      : []

    // Uploaded files: task attachments (Postgres, access-scoped) + clips (R2).
    const fileHits = wantFiles
      ? await this.searchTaskAttachments(workspaceId, userId, isManager, like, limit, Boolean(filters.includeArchived))
      : []
    const clipHits = wantFiles ? await this.searchClips(workspaceId, trimmed, limit) : []
    const driveHits = wantDrive ? await this.searchDrive(workspaceId, trimmed, limit, userId) : []
    const gmailHits = wantGmail ? await this.searchGmail(workspaceId, trimmed, limit, userId) : []
    const sharePointHits = wantSharePoint
      ? await this.searchSharePoint(workspaceId, trimmed, limit, userId)
      : []

    // Extras only for a general text search (no type/task-specific filter).
    // The code said so and did not do it: a search narrowed to open tasks
    // came back with channels, messages, comments and containers, none of
    // which has a status (measured, `workspace-read-access` §8).
    const extras = like && !hasTaskFilter
      ? await this.searchExtras(workspaceId, userId, like, limit, isManager, filters.types)
      : []

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
      ...driveHits,
      ...gmailHits,
      ...sharePointHits,
      ...extras,
    ], trending)
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
  private merge(
    sort: SearchFilters['sort'],
    limit: number,
    hits: SearchHit[],
    trending?: Map<string, number>,
  ): SearchHit[] {
    return this.applySort(sort, hits, trending).slice(0, limit)
  }

  /**
   * §G03-6 — how long "trending" looks back.
   *
   * Seven days. Short enough that a burst of interest still shows while it is
   * happening; long enough that a quiet Monday does not empty the list. The
   * window is the reason this is an event table and not a counter — a lifetime
   * count would put last quarter's busiest task on top forever.
   */
  private static readonly TRENDING_WINDOW_DAYS = 7

  /**
   * §G02-9 — the source strip, and whether each one can actually answer.
   *
   * Returned as data rather than assumed by the client, because "connected" is
   * a fact about this workspace's stored credentials and the client has no way
   * to know it. A tab that cannot answer must say so — an unconnected source
   * that returns nothing reads as "you have no matching files", which is false.
   *
   * §V2-11 — **"connected" now means "can answer", not "has a row".**
   *
   * Holding a live token was never sufficient and this is where that showed.
   * `searchDrive` has refused since §G03 to spend a round trip on a
   * `drive.file` grant, because such a grant sees only files this app created
   * and an account-wide query against it comes back empty — but this method
   * reported that same connection as CONNECTED, so the palette drew no notice
   * and the person read the empty list as the truth about their Drive. The
   * scope requirement is stated once in `SOURCE_SCOPE` and consulted here, so
   * the strip and the query agree about what a credential is good for.
   */
  async listSources(
    workspaceId: string,
    userId: string,
  ): Promise<Array<{ id: SearchSource; connected: boolean; provider: string | null; heldBy: 'you' | 'someone-else' | null }>> {
    const rows = await this.db
      .select({
        provider: workspaceIntegrationConnections.provider,
        status: workspaceIntegrationConnections.status,
        accessToken: workspaceIntegrationConnections.accessToken,
        scopes: workspaceIntegrationConnections.scopes,
        connectedById: workspaceIntegrationConnections.connectedById,
      })
      .from(workspaceIntegrationConnections)
      .where(eq(workspaceIntegrationConnections.workspaceId, workspaceId))
    const live = new Map<string, { scopes: readonly string[]; mine: boolean }>()
    for (const row of rows) {
      if (row.status !== 'connected' || !row.accessToken) continue
      live.set(row.provider as string, { scopes: row.scopes ?? [], mine: row.connectedById === userId })
    }
    return SEARCH_SOURCES.map((id) => {
      const provider = SOURCE_PROVIDER[id]
      // Our own data needs no credential and is always available.
      if (provider === null) return { id, provider, connected: true, heldBy: null }
      const grant = live.get(provider)
      if (!grant || !grantCoversSource(id, grant.scopes)) return { id, provider, connected: false, heldBy: null }
      // Somebody else's account answers them alone — see `federatedCredential` —
      // so for everyone else this source is not connected, and says whose it is.
      return grant.mine
        ? { id, provider, connected: true, heldBy: 'you' as const }
        : { id, provider, connected: false, heldBy: 'someone-else' as const }
    })
  }

  /** §G03-6 — somebody opened a search result. */
  async recordOpen(
    workspaceId: string,
    userId: string,
    entityType: string,
    entityId: string,
  ): Promise<{ ok: true }> {
    const type = (entityType ?? '').trim().slice(0, 40)
    const id = (entityId ?? '').trim().slice(0, 200)
    // Nothing to count without both halves, and a row with a blank id would
    // score against every hit that also has none.
    if (!type || !id) return { ok: true }
    await this.db.insert(searchEngagement).values({ workspaceId, userId, entityType: type, entityId: id })
    return { ok: true }
  }

  /**
   * §G03-6 — opens per hit inside the window, for one of the two questions.
   *
   * `mine` narrows to this person ("Trending For You"); otherwise it is the
   * whole workspace ("Trending In Workspace"). Counted in SQL rather than by
   * reading rows into the process: a busy workspace produces far more events
   * than search results, and pulling them all back to count them here is the
   * shape that works on a demo and falls over in a year.
   */
  private async engagementScores(
    workspaceId: string,
    userId: string,
    mine: boolean,
  ): Promise<Map<string, number>> {
    const since = new Date(Date.now() - SearchService.TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const rows = await this.db
      .select({
        entityType: searchEngagement.entityType,
        entityId: searchEngagement.entityId,
        opens: sql<number>`count(*)::int`,
      })
      .from(searchEngagement)
      .where(
        and(
          eq(searchEngagement.workspaceId, workspaceId),
          gte(searchEngagement.openedAt, since),
          mine ? eq(searchEngagement.userId, userId) : undefined,
        ),
      )
      .groupBy(searchEngagement.entityType, searchEngagement.entityId)
    const scores = new Map<string, number>()
    for (const r of rows) scores.set(`${r.entityType}:${r.entityId}`, Number(r.opens))
    return scores
  }

  /**
   * Order the merged result set. Relevance is whatever each branch's own query
   * returned, so we leave it alone; the timestamp modes sort across branches,
   * putting hits with no timestamp (files, people, messages) last rather than
   * letting an absent date read as "oldest".
   */
  private applySort(
    sort: SearchFilters['sort'],
    hits: SearchHit[],
    trending?: Map<string, number>,
  ): SearchHit[] {
    if (!sort || sort === 'relevance') return hits
    /*
     * §G03-6 — most-opened first, and ties fall back to RELEVANCE rather than
     * to nothing.
     *
     * Most hits have never been opened, so without a tiebreak the whole
     * unopened tail would come back in whatever order the branches happened to
     * produce — a sort that reorders the top few and shuffles everything else.
     * Keeping the incoming order for equal scores means trending PROMOTES what
     * is hot and leaves the rest exactly as relevance had it.
     */
    if (sort === 'trending' || sort === 'trending_me') {
      const scored = hits.map((h, i) => ({ h, i, score: trending?.get(engagementKey(h.id)) ?? 0 }))
      scored.sort((a, b) => (b.score - a.score) || (a.i - b.i))
      return scored.map((x) => x.h)
    }
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
   * The first `limit` Meili hits this caller is actually allowed to see.
   *
   * Meili applies its own limit before anything in this process can look at a
   * row, and both rules that remove a hit — archived, and per-caller
   * visibility — live in Postgres. Filtering a single page therefore throws
   * hits away without replacing them, and the search reports fewer results
   * than exist. Where most of what matches a word is in the bin it reports
   * NONE: the workspace this was found on holds 66 archived tasks matching
   * "a" against 10 live ones, so every hit on page one was binned, all five
   * were dropped, and an ordinary search answered "nothing" while ten live
   * tasks matched.
   *
   * That is worse than the leak it came from — a leak shows too much and is
   * obvious, an empty result looks like an answer.
   *
   * Visibility cannot be pushed into Meili (it is per caller, and the index
   * has no such field), and archived cannot either: `indexTask` runs on create
   * and on edit only, so a document's idea of archived would be stale the
   * moment anything was binned. Postgres stays the authority; this pages until
   * enough survive it.
   *
   * Bounded on purpose. A workspace with an enormous bin must not turn one
   * search into an unbounded scan, so scanning stops at SCAN_CAP and returns
   * what it has: fewer hits than ideal, rather than a slow request or none.
   */
  private async visibleMeiliHits(
    query: string,
    filterExpr: string[],
    sort: SearchFilters['sort'],
    limit: number,
    workspaceId: string,
    userId: string,
    isManager: boolean,
    includeArchived: boolean,
  ): Promise<SearchHit[]> {
    const SCAN_CAP = 500
    // Comfortably more than one page in the ordinary case, so the common
    // search still costs exactly one round trip to each of Meili and Postgres.
    const page = Math.min(Math.max(limit * 4, 40), SCAN_CAP)
    const kept: SearchHit[] = []
    const seen = new Set<string>()

    for (let offset = 0; offset < SCAN_CAP && kept.length < limit; offset += page) {
      const res = await this.index!.search(query, {
        filter: filterExpr,
        limit: Math.min(page, SCAN_CAP - offset),
        offset,
        sort: meiliSort(sort),
      })
      if (res.hits.length === 0) break

      const mapped = res.hits.map((h) => ({
        id: h.id,
        entityType: h.entityType,
        title: h.title,
        content: (h.content ?? '').slice(0, 200),
        url: h.url,
        // Carried through so the merge orders Meili hits and Postgres extras as
        // one list. Without it every Meili hit would look undated and sort to
        // the bottom, silently undoing the order Meili just applied.
        sortedAt: sort === 'created'
          ? new Date(h.createdAt)
          : sort === 'updated'
            ? new Date(h.updatedAt)
            : null,
      })) as SearchHit[]

      for (const hit of await this.dropUnsearchableTaskHits(mapped, workspaceId, userId, isManager, includeArchived)) {
        // Meili paginates a live index; a document can shift between pages and
        // arrive twice. Deduped here so a search cannot show the same task
        // under two headings.
        if (seen.has(hit.id)) continue
        seen.add(hit.id)
        kept.push(hit)
        if (kept.length >= limit) break
      }

      // A short page is the end of the result set, so there is nothing left to
      // page into — asking again would return the same nothing.
      if (res.hits.length < page) break
    }

    return kept
  }

  /**
   * Drop task hits from the Meili index that this search should not return —
   * ones the caller may not see, and ones that are in the bin.
   *
   * The index carries neither field. `indexTask` writes a task in on create and
   * on edit and there is no removal path anywhere, so a deleted task stays in
   * Meili forever: on a deployment with Meilisearch configured, an ordinary
   * search returned work that had been thrown away. The Postgres path had
   * filtered `isArchived` all along (see the fallback query), which is why this
   * only ever showed up where Meili was actually running.
   *
   * Archived is enforced even for a manager. Managers skip the VISIBILITY
   * check — that is what being a manager means here — but nobody is meant to
   * find deleted work by searching, and the previous early return for managers
   * meant they skipped both checks at once.
   *
   * A doc hit is held to the doc rule (`doc-access.ts`), and a task hit to the
   * container rule as well as the private-item rule: the index carries neither,
   * and this let through every task and doc of a private space to a member
   * refused it. `search.service.test.ts` holds this half, and a lane that
   * `RUNDESK_LANE_SEARCH` names measures it (`search-index`).
   *
   * A file hit is held to its task's rules, as the Postgres path's file search
   * is: a member refused a private space found, by name, the file on its task
   * (`found-29-sep/meili-file-hits-skip-the-read-rule`). And a doc hit is held
   * to the archived rule, for managers too, as a task hit is: nothing removes a
   * doc from the index, so a deleted doc was still found
   * (`found-29-sep/meili-finds-deleted-docs`). A hit whose row is gone is
   * dropped. Other hits pass through untouched.
   */
  private async dropUnsearchableTaskHits<T extends { id: string; entityType: string }>(
    hits: T[],
    workspaceId: string,
    userId: string,
    isManager: boolean,
    includeArchived: boolean,
  ): Promise<T[]> {
    // Nothing to ask the database when neither rule applies to this caller.
    if (isManager && includeArchived) return hits

    const docHits = hits.filter((h) => h.entityType === 'doc')
    if (docHits.length > 0) {
      const docId = (hitId: string) => hitId.replace(/^doc-/, '')
      const live = await this.db
        .select({ id: docs.id })
        .from(docs)
        .where(and(
          inArray(docs.id, docHits.map((h) => docId(h.id))),
          eq(docs.workspaceId, workspaceId),
          includeArchived ? undefined : eq(docs.isArchived, false),
        ))
      const found = new Set(live.map((r) => r.id))
      const hidden = isManager ? new Set<string>() : new Set(await hiddenDocIds(this.db, workspaceId, userId, false))
      hits = hits.filter((h) => h.entityType !== 'doc' || (found.has(docId(h.id)) && !hidden.has(docId(h.id))))
    }

    const fileHits = hits.filter((h) => h.entityType === 'file')
    if (fileHits.length > 0) {
      const fileId = (hitId: string) => hitId.replace(/^file-/, '')
      const fileConds: Array<SQL | undefined> = [
        inArray(taskAttachments.id, fileHits.map((h) => fileId(h.id))),
        eq(spaces.workspaceId, workspaceId),
        includeArchived ? undefined : eq(tasks.isArchived, false),
        taskInReachFilter(this.db, workspaceId, userId, isManager),
        taskVisibilityFilter(this.db, userId, isManager),
      ]
      const keepFiles = await this.db
        .select({ id: taskAttachments.id })
        .from(taskAttachments)
        .innerJoin(tasks, eq(tasks.id, taskAttachments.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(...fileConds))
      const okFiles = new Set(keepFiles.map((r) => r.id))
      hits = hits.filter((h) => h.entityType !== 'file' || okFiles.has(fileId(h.id)))
    }

    /*
     * A Meili hit's id is the DOCUMENT id, which `indexTask` writes as
     * `task-<uuid>` — not a uuid. Handing those straight to a uuid column is a
     * Postgres 22P02 and a 400 for the whole search.
     *
     * The previous version had the same bug and never showed it: it returned
     * early for managers, and a manager is who tends to be looking when anyone
     * checks. Stripped here once, and compared stripped.
     */
    const taskHits = hits.filter((h) => h.entityType === 'task')
    if (taskHits.length === 0) return hits
    const rawId = (docId: string) => docId.replace(/^task-/, '')

    const conds: Array<SQL | undefined> = [inArray(tasks.id, taskHits.map((h) => rawId(h.id)))]
    if (!includeArchived) conds.push(eq(tasks.isArchived, false))
    if (!isManager) {
      conds.push(taskInReachFilter(this.db, workspaceId, userId, false))
      conds.push(taskVisibilityFilter(this.db, userId, false))
    }

    const keep = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      // Joined for the container rule, which reads the task's project and space.
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(...conds))
    const ok = new Set(keep.map((r) => r.id))
    return hits.filter((h) => h.entityType !== 'task' || ok.has(rawId(h.id)))
  }

  /** Search users, comments, channels, and messages (Plan §11.1). */
  /**
   * Users, comments, channels and messages — the entity types Meilisearch does
   * not index. `types` narrows which of them to run; passing a filter that
   * names none of them short-circuits to nothing, which is why the caller can
   * hand its type chips straight through instead of skipping this entirely.
   */
  /**
   * The one network call Drive search makes, behind a method so a test can
   * replace it.
   *
   * `safeFetch` issues through node:http rather than global fetch — there is no
   * global to stub — and its SSRF guard rejects loopback, so a local test server
   * is not an option either. Without this seam the Drive tests would either hit
   * the real Google or, worse, quietly pass while never calling anything.
   */
  protected async driveRequest(url: string, token: string): Promise<{ status: number; text: string } | null> {
    return this.federatedRequest(url, token)
  }

  /**
   * The one outbound call every federated source makes.
   *
   * `driveRequest` above forwards to this and stays as its own override point
   * only because `search.service.test.ts` names it; a seam per source would be
   * the duplicated-list defect in miniature — three copies of one request, two
   * of which eventually drift on a header or a timeout.
   */
  protected async federatedRequest(
    url: string,
    token: string,
    init?: { method?: string; body?: string },
  ): Promise<{ status: number; text: string } | null> {
    const res = await safeFetch(url, {
      method: init?.method,
      body: init?.body,
      headers: init?.body
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { Authorization: `Bearer ${token}` },
      timeoutMs: 10_000,
    })
    return { status: res.status, text: res.text() }
  }

  /**
   * §4 [04:20] — files from the workspace's linked Google Drive.
   *
   * "Yeh ClickUp ki quality hai ke woh apni workspace ko itna BROADER mein le
   * ke jaa raha hai" [04:26]: the point is that searching here reaches past
   * here. Returns nothing — never throws — when no Drive is linked, when the
   * token has gone stale, or when Google is having a bad day: an integration
   * being down must not take the whole search down with it.
   */
  private async searchDrive(workspaceId: string, query: string, limit: number, userId: string): Promise<SearchHit[]> {
    const trimmed = query.trim()
    if (!trimmed) return []
    const [conn] = await this.db
      .select({
        status: workspaceIntegrationConnections.status,
        accessToken: workspaceIntegrationConnections.accessToken,
        scopes: workspaceIntegrationConnections.scopes,
        connectedById: workspaceIntegrationConnections.connectedById,
      })
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, 'google-drive'),
        ),
      )
      .limit(1)
    if (!conn || conn.status !== 'connected' || !conn.accessToken) return []
    // Somebody's own Drive, searched for them alone — see `federatedCredential`.
    if (conn.connectedById !== userId) return []

    /*
     * A grant that cannot answer the question we are about to ask.
     *
     * Connections made before the scope changed hold `drive.file`, which sees
     * only files this app created or the user picked by hand. The query below
     * is account-wide, so against such a grant Google answers "nothing" — and
     * an empty Drive section reads to a person as "you have no matching
     * files", which is false.
     *
     * Skipped and logged rather than sent anyway: a request that cannot
     * succeed is not worth a round trip, and the log is the only place this
     * currently says why. Reconnecting the integration re-consents at the
     * broader scope.
     */
    if (!grantCoversWholeDrive(conn.scopes)) {
      this.logger?.warn?.(
        `Drive search skipped for workspace ${workspaceId}: the stored grant is missing ` +
          `${DRIVE_SEARCH_SCOPE}, so an account-wide query would return nothing. Reconnect Google Drive.`,
      )
      return []
    }

    // Drive's `q` is its own query language, and the term is interpolated into
    // a quoted string inside it. A name containing an apostrophe would close
    // that string early and change the query — so escape backslashes first,
    // then quotes, exactly as Google's grammar requires.
    const escaped = trimmed.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const base = process.env.GOOGLE_DRIVE_API_URL ?? 'https://www.googleapis.com/drive/v3'
    const params = new URLSearchParams({
      q: `name contains '${escaped}' and trashed = false`,
      fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
      pageSize: String(Math.min(Math.max(limit, 1), 25)),
    })
    try {
      const res = await this.driveRequest(`${base}/files?${params.toString()}`, conn.accessToken)
      if (!res || res.status < 200 || res.status >= 300) return []
      const body = JSON.parse(res.text) as {
        files?: Array<{
          id?: string
          name?: string
          mimeType?: string
          webViewLink?: string
          modifiedTime?: string
        }>
      }
      return (body.files ?? [])
        .filter((f) => f.id && f.name)
        .map((f) => ({
          id: `drive-${f.id}`,
          entityType: 'drive',
          title: f.name as string,
          // Says it is not from here, because a result that opens a new tab to
          // another product should say so before you click it.
          content: 'Google Drive',
          url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
          sortedAt: f.modifiedTime ? new Date(f.modifiedTime) : null,
        }))
    } catch {
      return []
    }
  }

  /**
   * The stored credential a federated source's query would use, or `null`.
   *
   * Returns nothing when there is no row, when the row is not connected, when
   * it holds no token, or when the grant it holds cannot answer this source's
   * question. That last clause is the point: a round trip that is guaranteed
   * to come back empty is not worth making, and — with `listSources` reading
   * the same predicate — the strip has already told the person why.
   */
  private async federatedCredential(
    workspaceId: string,
    source: SearchSource,
    userId: string,
  ): Promise<string | null> {
    const provider = SOURCE_PROVIDER[source]
    if (!provider) return null
    const [conn] = await this.db
      .select({
        status: workspaceIntegrationConnections.status,
        accessToken: workspaceIntegrationConnections.accessToken,
        scopes: workspaceIntegrationConnections.scopes,
        connectedById: workspaceIntegrationConnections.connectedById,
      })
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, provider),
        ),
      )
      .limit(1)
    if (!conn || conn.status !== 'connected' || !conn.accessToken) return null
    /*
     * THE GRANT IS ONE PERSON'S, SO IT ANSWERS ONE PERSON. The connection is a
     * single Google or Microsoft account — somebody's own mailbox and Drive —
     * and every member who searched, guests included, used to search it: the
     * connector's mail subjects, senders and snippets for anybody in the
     * workspace. The frame is somebody searching "meri Gmail" — MY Gmail. So
     * it answers the person who connected it, and nobody else.
     */
    if (conn.connectedById !== userId) return null
    if (!grantCoversSource(source, conn.scopes)) {
      // Named from the table rather than from a ternary here: a log line that
      // reports the wrong missing scope sends somebody to fix the wrong thing.
      this.logger?.warn?.(
        `${source} search skipped for workspace ${workspaceId}: the stored grant is missing ` +
          `${SOURCE_SCOPE[source]}, so the query would return nothing. Reconnect the integration.`,
      )
      return null
    }
    return conn.accessToken
  }

  /**
   * §V2-11 `19:07` / [19:18] — "Main is se kahoongi meri Gmail pe jaa ke…".
   *
   * The frame draws a Gmail tile reading "Search all your emails to get the
   * latest updates…", the palette has shipped a **Gmail** tab since §G02-9, and
   * behind both there was nothing at all — no provider to connect, no query to
   * run. This is that query.
   *
   * Two round trips, because that is how Gmail works: the list endpoint returns
   * ids and nothing else, and a subject has to be fetched per message. The
   * fan-out is capped hard — a search box must not be able to spend twenty-five
   * requests on one keystroke — so a wide query returns the first few with
   * their real subjects rather than a page of "(no subject)".
   */
  private async searchGmail(workspaceId: string, query: string, limit: number, userId: string): Promise<SearchHit[]> {
    const trimmed = query.trim()
    if (!trimmed) return []
    const token = await this.federatedCredential(workspaceId, 'gmail', userId)
    if (!token) return []

    /*
     * Gmail's `q` is its own query language: `from:`, `-word` and `OR` are
     * operators, so a term typed by a person changes the search rather than
     * being the search. Wrapped as one quoted phrase, with the quote character
     * removed first so it cannot close the phrase early — the same failure the
     * Drive path escapes for, in a different grammar.
     */
    const phrase = trimmed.replace(/"/g, ' ').trim()
    if (!phrase) return []
    const base = process.env.GMAIL_API_URL ?? 'https://gmail.googleapis.com/gmail/v1'
    const wanted = Math.min(Math.max(limit, 1), SearchService.MAX_GMAIL_MESSAGES)
    const listParams = new URLSearchParams({ q: `"${phrase}"`, maxResults: String(wanted) })
    try {
      const listed = await this.federatedRequest(`${base}/users/me/messages?${listParams}`, token)
      if (!listed || listed.status < 200 || listed.status >= 300) return []
      const body = JSON.parse(listed.text) as { messages?: Array<{ id?: string; threadId?: string }> }
      const ids = (body.messages ?? []).map((m) => m.id).filter((id): id is string => !!id)
      const hits: SearchHit[] = []
      for (const id of ids.slice(0, wanted)) {
        const detailParams = new URLSearchParams({ format: 'metadata' })
        detailParams.append('metadataHeaders', 'Subject')
        detailParams.append('metadataHeaders', 'From')
        detailParams.append('metadataHeaders', 'Date')
        const detail = await this.federatedRequest(
          `${base}/users/me/messages/${encodeURIComponent(id)}?${detailParams}`,
          token,
        )
        if (!detail || detail.status < 200 || detail.status >= 300) continue
        const msg = JSON.parse(detail.text) as {
          id?: string
          snippet?: string
          internalDate?: string
          payload?: { headers?: Array<{ name?: string; value?: string }> }
        }
        const header = (name: string) =>
          msg.payload?.headers?.find((h) => (h.name ?? '').toLowerCase() === name)?.value ?? ''
        const subject = header('subject').trim()
        hits.push({
          id: `gmail-${id}`,
          entityType: 'gmail',
          // A mail with no subject is a real mail. Named for its sender rather
          // than dropped, because dropping it is another silent empty list.
          title: subject || (header('from') ? `(no subject) — ${header('from')}` : '(no subject)'),
          // Says it is not from here, exactly as a Drive hit does.
          content: (msg.snippet ?? '').slice(0, 200) || 'Gmail',
          url: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`,
          sortedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : null,
        })
      }
      return hits
    } catch {
      return []
    }
  }

  /** How many messages one Gmail search is allowed to fetch in full. */
  private static readonly MAX_GMAIL_MESSAGES = 8

  /**
   * §V2-11 `19:07` — "Microsoft SharePoint · Easily attach, create, and search
   * for SharePoint files…".
   *
   * One round trip, through Graph's search endpoint, which is the only Graph
   * call that spans sites the caller has not named. `Sites.Read.All` is what
   * makes it answerable — the OneDrive grant this source used to borrow carries
   * `Files.ReadWrite`, which reaches the signed-in user's own drive and no
   * SharePoint site at all, so the borrowed credential produced a permanently
   * empty list that the strip reported as connected.
   */
  private async searchSharePoint(
    workspaceId: string,
    query: string,
    limit: number,
    userId: string,
  ): Promise<SearchHit[]> {
    const trimmed = query.trim()
    if (!trimmed) return []
    const token = await this.federatedCredential(workspaceId, 'sharepoint', userId)
    if (!token) return []

    const base = process.env.MICROSOFT_GRAPH_API_URL ?? 'https://graph.microsoft.com/v1.0'
    const payload = JSON.stringify({
      requests: [
        {
          entityTypes: ['driveItem'],
          // Sent as JSON rather than interpolated into a URL: Graph's KQL
          // treats `:` and `"` as syntax, and a term carrying one would
          // otherwise rewrite the query instead of being searched for.
          query: { queryString: trimmed },
          from: 0,
          size: Math.min(Math.max(limit, 1), 25),
        },
      ],
    })
    try {
      const res = await this.federatedRequest(`${base}/search/query`, token, {
        method: 'POST',
        body: payload,
      })
      if (!res || res.status < 200 || res.status >= 300) return []
      const body = JSON.parse(res.text) as {
        value?: Array<{
          hitsContainers?: Array<{
            hits?: Array<{
              resource?: {
                id?: string
                name?: string
                webUrl?: string
                lastModifiedDateTime?: string
              }
            }>
          }>
        }>
      }
      const hits = (body.value ?? []).flatMap((v) => (v.hitsContainers ?? []).flatMap((c) => c.hits ?? []))
      return hits
        .map((h) => h.resource)
        .filter((r): r is { id?: string; name?: string; webUrl?: string; lastModifiedDateTime?: string } =>
          Boolean(r?.name && r?.webUrl),
        )
        .map((r) => ({
          id: `sharepoint-${r.id ?? r.webUrl}`,
          entityType: 'sharepoint',
          title: r.name as string,
          content: 'Microsoft SharePoint',
          url: r.webUrl as string,
          sortedAt: r.lastModifiedDateTime ? new Date(r.lastModifiedDateTime) : null,
        }))
    } catch {
      return []
    }
  }

  private async searchExtras(
    workspaceId: string,
    userId: string,
    like: string,
    limit: number,
    isManager = false,
    types?: string[],
  ) {
    const wants = (t: string) => !types || types.includes(t)
    const EXTRA_TYPES = ['user', 'comment', 'channel', 'message', 'folder', 'list', 'space', 'meeting']
    if (!EXTRA_TYPES.some(wants)) return []
    // Chat search reads channels as chat itself does (`readableChannelsFilter`,
    // the SQL twin of `assertChannelAccess`). Its own copy here knew public
    // and joined channels but not the space: a channel of a private space, and
    // every message in it, came back to a member refused the space (measured).
    const accessibleChannel = readableChannelsFilter(this.db, userId, workspaceId)

    const [userHits, commentHits, channelHits, messageHits, folderHits, listHits, spaceHits, meetingHits] =
      await Promise.all([
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
        .where(
          and(
            eq(spaces.workspaceId, workspaceId),
            ilike(taskComments.body, like),
            taskInReachFilter(this.db, workspaceId, userId, isManager),
            taskVisibilityFilter(this.db, userId, isManager),
          ),
        )
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
      /*
       * §2 [02:03] — the containers themselves. Scoped with the same visibility
       * filters every other read path uses, so a private folder or list stays
       * invisible here too; search must not become the one surface where a
       * container you cannot open is still discoverable by name. The SPACE half
       * of that was missing, which made this comment untrue: a private space's
       * folders, lists and its own name came back to a member refused it.
       */
      wants('folder')
        ? this.db
            .select({ id: folders.id, name: folders.name, spaceId: folders.spaceId, spaceName: spaces.name })
            .from(folders)
            .innerJoin(spaces, eq(spaces.id, folders.spaceId))
            .where(
              and(
                eq(spaces.workspaceId, workspaceId),
                ilike(folders.name, like),
                eq(folders.isArchived, false),
                spaceVisibilityFilter(this.db, userId, isManager),
                folderVisibilityFilter(userId, isManager),
              ),
            )
            .limit(limit)
        : Promise.resolve([]),
      wants('list')
        ? this.db
            .select({
              id: lists.id, name: lists.name,
              projectId: projects.id, spaceId: spaces.id, projectName: projects.name,
            })
            .from(lists)
            .innerJoin(projects, eq(projects.id, lists.projectId))
            .innerJoin(spaces, eq(spaces.id, projects.spaceId))
            .where(
              and(
                eq(spaces.workspaceId, workspaceId),
                ilike(lists.name, like),
                containerVisibilityFilter(this.db, userId, isManager),
                listVisibilityFilter(userId, isManager),
              ),
            )
            .limit(limit)
        : Promise.resolve([]),
      wants('space')
        ? this.db
            .select({ id: spaces.id, name: spaces.name })
            .from(spaces)
            .where(and(eq(spaces.workspaceId, workspaceId), ilike(spaces.name, like), spaceVisibilityFilter(this.db, userId, isManager)))
            .limit(limit)
        : Promise.resolve([]),
      /*
       * §G14-15 — meeting notes.
       *
       * A meeting you could read on its own page could not be found from
       * anywhere else, and the notes are often the only written record of a
       * decision. Title AND notes, because "what did we decide about pricing"
       * is a question about the body, not the heading.
       *
       * Scoped by workspace and nothing more, which is the whole rule: meetings
       * carry no per-item privacy (`meetings.service.ts` gates on workspace
       * membership alone), and inventing a stricter filter here would hide rows
       * from search that the meetings page shows.
       */
      wants('meeting')
        ? this.db
            .select({ id: meetings.id, title: meetings.title, notes: meetings.notes })
            .from(meetings)
            .where(
              and(
                eq(meetings.workspaceId, workspaceId),
                or(ilike(meetings.title, like), ilike(meetings.notes, like)),
              ),
            )
            .orderBy(desc(meetings.createdAt))
            .limit(limit)
        : Promise.resolve([]),
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
      // Containers say where they live, because "Design" as a folder name is
      // only useful once you know which space it is in.
      ...folderHits.map((f) => ({
        id: `folder-${f.id}`, entityType: 'folder', title: f.name, content: f.spaceName ?? '',
        url: `/app/${workspaceId}/${f.spaceId}`,
      })),
      ...listHits.map((l) => ({
        id: `list-${l.id}`, entityType: 'list', title: l.name, content: l.projectName ?? '',
        url: `/app/${workspaceId}/${l.spaceId}/${l.projectId}/${l.id}`,
      })),
      ...spaceHits.map((sp) => ({
        id: `space-${sp.id}`, entityType: 'space', title: sp.name, content: '',
        url: `/app/${workspaceId}/${sp.id}`,
      })),
      // Deep-linked, not just "the meetings page": a hit that lands you among
      // two hundred rows and leaves you to find it is search that found
      // something rather than search that took you to it.
      ...meetingHits.map((m) => ({
        id: `meeting-${m.id}`, entityType: 'meeting', title: m.title,
        content: (m.notes ?? '').slice(0, 200),
        url: `/app/${workspaceId}/meetings?meeting=${m.id}`,
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
    includeArchived = false,
  ): Promise<Array<{ id: string; entityType: string; title: string; content: string; url: string }>> {
    const conds: Array<SQL | undefined> = [
      eq(spaces.workspaceId, workspaceId),
      // The container rule too: the join reached the space but nothing asked
      // whether the caller may open it (measured, a private space's file).
      taskInReachFilter(this.db, workspaceId, userId, isManager),
      taskVisibilityFilter(this.db, userId, isManager),
      // A file goes where its task goes: search withheld an archived or binned
      // task and still found its file (`found-29-sep/files-of-binned-tasks-found`).
      includeArchived ? undefined : eq(tasks.isArchived, false),
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
      // Every clip, newest first: one page of 200 was the workspace's OLDEST
      // 200, so a clip made after them was never found
      // (`found-23-sep/clip-library-lists-the-oldest-200`).
      const listed = (await r2.listAllObjects(`workspaces/${workspaceId}/clips/`)).reverse()
      for (const obj of listed) {
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
  async listWorkspaceCustomFields(workspaceId: string, userId: string, actorRole?: string) {
    // Each field belongs to a project, and the list names the project: only
    // those the caller may open (measured, a refused project's field listed).
    const isManager = await resolveIsManager(this.db, workspaceId, userId, actorRole)
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
      .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(this.db, userId, isManager)))
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
      ? sql`${valueExpr} ILIKE ${likeContaining(value)}`
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
