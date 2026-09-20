import { OnModuleInit } from '@nestjs/common';
import { type SearchSource } from './sources';
import { ConfigService } from '@nestjs/config';
import type { Db } from '@rundesk/db';
import { R2Service } from '../../common/storage/r2.service';
export type SearchEntityType = 'task' | 'doc' | 'file' | 'user' | 'comment' | 'channel' | 'message' | 'meeting' | 'folder' | 'list' | 'space' | 'drive';
/**
 * One search result. `sortedAt` is only present on the branches that carry a
 * timestamp (tasks, docs); files, people and messages leave it unset and sort
 * to the end under a timestamp sort.
 */
export type SearchHit = {
    id: string;
    entityType: string;
    title: string;
    content: string;
    url: string;
    sortedAt?: Date | string | null;
};
export type SearchFilters = {
    types?: SearchEntityType[];
    statusCategory?: 'open' | 'in_progress' | 'closed';
    priority?: 'urgent' | 'high' | 'normal' | 'low';
    assigneeId?: string;
    /** §A2.4 — narrow to tasks a given member created. */
    creatorId?: string;
    labelId?: string;
    /** §1.1 — narrow to one task type (Task, Milestone, …). */
    taskTypeId?: string;
    dueAfter?: Date;
    dueBefore?: Date;
    /**
     * §2 [04:00] — "abhi hua tha yeh — last created date kya thi — dates ke
     * lehaz par". Distinct from the due dates above: when a thing was made, not
     * when it is owed. Sorting by created already existed; filtering did not.
     */
    createdAfter?: Date;
    createdBefore?: Date;
    /**
     * §2 [02:35] — "LOCATION ka matlab yeh hota hai ke woh kis space mein para
     * hai, ya kis list mein para hai." Which container it sits in.
     */
    spaceId?: string;
    /**
     * A folder groups projects inside a space, so narrowing to one means
     * "anything under these projects" — the level between the two she named.
     */
    folderId?: string;
    listId?: string;
    /**
     * §A2.4 — search hard-excluded archived rows, which is right by default and
     * wrong when you are hunting for something you archived last month.
     */
    includeArchived?: boolean;
    /**
     * §A2.4 — "main sort bhi kar sakti hoon: last update, last created". Relevance
     * is the default; the other two order the merged result set by a timestamp
     * each branch now carries.
     */
    sort?: 'relevance' | 'updated' | 'created' | 'trending' | 'trending_me';
    customFieldId?: string;
    customFieldValue?: string;
};
/** Meili sort expression for a timestamp mode; undefined when relevance is wanted. */
export declare function meiliSort(sort: SearchFilters['sort']): string[] | undefined;
export declare class SearchService implements OnModuleInit {
    private db;
    private config;
    private readonly r2?;
    private readonly logger;
    private client?;
    private index?;
    private enabled;
    constructor(db: Db, config: ConfigService, r2?: R2Service | undefined);
    onModuleInit(): Promise<void>;
    indexTask(task: {
        id: string;
        title: string;
        description: string | null;
        listId: string;
        createdAt: Date;
        updatedAt?: Date | null;
    }, workspaceId: string, spaceId: string, projectId: string): Promise<void>;
    indexDoc(doc: {
        id: string;
        title: string;
        plaintext: string;
        workspaceId: string;
        spaceId: string | null;
        createdAt: Date;
        updatedAt?: Date | null;
    }): Promise<void>;
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
    removeTask(taskId: string): Promise<void>;
    indexTaskAttachment(attachment: {
        id: string;
        fileName: string;
        contentType: string;
        createdAt: Date;
    }, task: {
        id: string;
        listId: string;
    }, workspaceId: string, spaceId: string, projectId: string): Promise<void>;
    reindexWorkspace(workspaceId: string): Promise<{
        indexed: number;
    } | undefined>;
    search(workspaceId: string, userId: string, query: string, limit?: number, filters?: SearchFilters): Promise<Array<{
        id: string;
        entityType: string;
        title: string;
        content: string;
        url: string;
    }>>;
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
    private merge;
    /**
     * §G03-6 — how long "trending" looks back.
     *
     * Seven days. Short enough that a burst of interest still shows while it is
     * happening; long enough that a quiet Monday does not empty the list. The
     * window is the reason this is an event table and not a counter — a lifetime
     * count would put last quarter's busiest task on top forever.
     */
    private static readonly TRENDING_WINDOW_DAYS;
    /**
     * §G02-9 — the source strip, and whether each one can actually answer.
     *
     * Returned as data rather than assumed by the client, because "connected" is
     * a fact about this workspace's stored credentials and the client has no way
     * to know it. A tab that cannot answer must say so — an unconnected source
     * that returns nothing reads as "you have no matching files", which is false.
     */
    listSources(workspaceId: string): Promise<Array<{
        id: SearchSource;
        connected: boolean;
        provider: string | null;
    }>>;
    /** §G03-6 — somebody opened a search result. */
    recordOpen(workspaceId: string, userId: string, entityType: string, entityId: string): Promise<{
        ok: true;
    }>;
    /**
     * §G03-6 — opens per hit inside the window, for one of the two questions.
     *
     * `mine` narrows to this person ("Trending For You"); otherwise it is the
     * whole workspace ("Trending In Workspace"). Counted in SQL rather than by
     * reading rows into the process: a busy workspace produces far more events
     * than search results, and pulling them all back to count them here is the
     * shape that works on a demo and falls over in a year.
     */
    private engagementScores;
    /**
     * Order the merged result set. Relevance is whatever each branch's own query
     * returned, so we leave it alone; the timestamp modes sort across branches,
     * putting hits with no timestamp (files, people, messages) last rather than
     * letting an absent date read as "oldest".
     */
    private applySort;
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
    private visibleMeiliHits;
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
     * Non-task hits pass through untouched.
     */
    private dropUnsearchableTaskHits;
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
    protected driveRequest(url: string, token: string): Promise<{
        status: number;
        text: string;
    } | null>;
    /**
     * §4 [04:20] — files from the workspace's linked Google Drive.
     *
     * "Yeh ClickUp ki quality hai ke woh apni workspace ko itna BROADER mein le
     * ke jaa raha hai" [04:26]: the point is that searching here reaches past
     * here. Returns nothing — never throws — when no Drive is linked, when the
     * token has gone stale, or when Google is having a bad day: an integration
     * being down must not take the whole search down with it.
     */
    private searchDrive;
    private searchExtras;
    /**
     * Search uploaded files stored as task attachments (Plan §11.1). Access is
     * scoped exactly like task and comment search: an attachment is reachable only
     * through its task → list → project → space, and that space must belong to the
     * caller's workspace. An attachment whose task lives in another workspace (or
     * any container the caller can't reach) never satisfies the join, so it can
     * never leak into these results. Matches the file name and its content type.
     */
    private searchTaskAttachments;
    /**
     * Search uploaded screen-recording "clips" (Plan §11.1). Clips are stored as
     * R2 objects under `workspaces/<id>/clips/`, not in the DB, so we match on the
     * file name embedded in each object key. The workspace prefix is the entire
     * access boundary — a clip is only ever listed under its own workspace, so it
     * cannot cross workspaces. Best-effort: any storage error (or R2 not being
     * configured) yields no clip hits rather than failing the whole search.
     */
    private searchClips;
    /**
     * List every custom-field definition reachable in a workspace (across all its
     * spaces/projects) so the search UI can offer them as a filter. Workspace
     * ownership is enforced via the project → space → workspace join.
     */
    listWorkspaceCustomFields(workspaceId: string): Promise<{
        id: string;
        name: string;
        type: "number" | "date" | "email" | "labels" | "text" | "url" | "dropdown" | "checkbox" | "phone" | "money" | "rating" | "progress_auto" | "long_text" | "people" | "location" | "tshirt_size" | "progress_manual" | "files" | "voting";
        options: {
            label: string;
            value: string;
            color?: string;
        }[] | null;
        projectId: string;
        projectName: string;
    }[]>;
    /**
     * Build the SQL condition that restricts `tasks.id` to those whose stored
     * value for the given custom-field definition matches `value`. The field's
     * type decides the operator: free-text types use a case-insensitive contains
     * (ILIKE), everything else uses exact equality on the JSON scalar (`value->>'v'`).
     * An unknown/foreign field id matches nothing, keeping results workspace-scoped.
     */
    private customFieldValueCondition;
    listSavedSearches(workspaceId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        name: string;
        query: string | null;
        filters: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    createSavedSearch(workspaceId: string, userId: string, name: string, query: string | null, filters: Record<string, unknown>): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        query: string | null;
        userId: string;
        filters: Record<string, unknown>;
    }>;
    deleteSavedSearch(id: string, userId: string): Promise<{
        ok: boolean;
    }>;
}
