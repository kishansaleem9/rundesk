import type { Db } from '@rundesk/db';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SearchService } from '../search/search.service';
import { NotificationsService } from '../notifications/notifications.service';
/** Docs-hub buckets (A5.6). `all` excludes archived, matching the old default. */
export declare const DOC_SCOPES: readonly ["all", "mine", "shared", "archived"];
export type DocScope = (typeof DOC_SCOPES)[number];
export declare class DocsService {
    private db;
    private realtime;
    private search;
    private notifications;
    constructor(db: Db, realtime: RealtimeGateway, search: SearchService, notifications: NotificationsService);
    private indexDocInSearch;
    /**
     * A5.6 / A5.7 — the hub buckets are filters over columns that already exist,
     * not a new model: `mine` reads `createdById`, `archived` flips the
     * `isArchived` predicate the tree relies on, and `shared` is the reverse
     * `object_shares` lookup. Every row also carries what an index table needs
     * (creator, location, subpage count, sharing state) so the table and the tree
     * are the same read.
     */
    list(workspaceId: string, opts?: {
        spaceId?: string | null;
        parentDocId?: string | null;
        scope?: DocScope;
        userId?: string;
    }): Promise<{
        id: string;
        workspaceId: string;
        spaceId: string | null;
        parentDocId: string | null;
        createdById: string | null;
        title: string;
        icon: string | null;
        coverImageUrl: string | null;
        content: Record<string, unknown>;
        plaintext: string;
        position: number;
        isArchived: boolean;
        publicShareId: string | null;
        publicShareEnabledAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        createdByName: string | null;
        createdByEmail: string | null;
        spaceName: string | null;
        subpageCount: number;
        shareCount: number;
    }[]>;
    /**
     * Per-bucket totals for the docs hub rail (A5.6). Counted directly rather
     * than by length of `list()` — that would fetch every doc's jsonb body four
     * times to produce four integers.
     */
    scopeCounts(workspaceId: string, userId: string): Promise<{
        all: number;
        mine: number;
        shared: number;
        archived: number;
    }>;
    /** Doc ids in this workspace explicitly granted to `userId` (A1.7's table). */
    private docIdsSharedWith;
    get(docId: string): Promise<{
        id: string;
        workspaceId: string;
        spaceId: string | null;
        parentDocId: string | null;
        createdById: string | null;
        title: string;
        icon: string | null;
        coverImageUrl: string | null;
        content: Record<string, unknown>;
        plaintext: string;
        position: number;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        publicShareId: string | null;
        publicShareEnabledAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private assertDocAccess;
    getForUser(docId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        spaceId: string | null;
        parentDocId: string | null;
        createdById: string | null;
        title: string;
        icon: string | null;
        coverImageUrl: string | null;
        content: Record<string, unknown>;
        plaintext: string;
        position: number;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        publicShareId: string | null;
        publicShareEnabledAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * §V2-10 — the tasks linked to this doc.
     *
     * `[06:15]` "acha, is document ka yeh task hai" — she describes reading the
     * relationship FROM THE DOCUMENT. Rundesk has had `task_doc_links` since
     * relationships shipped and read it in exactly one direction:
     * `where(taskDocLinks.taskId)` in `tasks.service.listLinkedDocs`. A task knew
     * its docs; a doc knew nothing. Half a relationship is not a relationship —
     * linking from the task and then opening the doc showed no sign it had
     * happened.
     *
     * Visibility is filtered rather than assumed. Doc access is workspace
     * membership, but a linked task may be PRIVATE, and a doc that lists it would
     * be a way to read titles somebody is not allowed to see. So the same filter
     * the task lists use is applied here — a manager sees everything, everyone
     * else sees public tasks plus their own.
     */
    listLinkedTasks(docId: string, userId: string, globalRole?: string | null): Promise<{
        id: string;
        taskId: string;
        title: string;
        status: string;
        statusCategory: import("@rundesk/db").StatusCategory;
        listId: string;
        linkedAt: Date;
    }[]>;
    create(data: {
        workspaceId: string;
        spaceId?: string | null;
        parentDocId?: string | null;
        title?: string;
        icon?: string;
        createdById: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isArchived: boolean;
        workspaceId: string;
        icon: string | null;
        createdById: string | null;
        archivedAt: Date | null;
        archivedById: string | null;
        spaceId: string | null;
        position: number;
        title: string;
        coverImageUrl: string | null;
        content: Record<string, unknown>;
        parentDocId: string | null;
        plaintext: string;
        publicShareId: string | null;
        publicShareEnabledAt: Date | null;
    }>;
    /**
     * Export a doc as Markdown. Access-checked; the title becomes the top H1
     * unless the body already opens with one.
     */
    exportDocMarkdown(docId: string, userId: string): Promise<{
        fileName: string;
        markdown: string;
    }>;
    /** Export a doc as a (line-based) PDF. Access-checked. */
    exportDocPdf(docId: string, userId: string): Promise<{
        fileName: string;
        pdf: Buffer<ArrayBufferLike>;
    }>;
    /** Reusable doc templates in a workspace, most-recent first. */
    listDocTemplates(workspaceId: string): Promise<{
        id: string;
        name: string;
        description: string | null;
        icon: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    /** Snapshot an existing doc's content into a reusable template. */
    saveDocAsTemplate(workspaceId: string, userId: string, data: {
        docId: string;
        name: string;
        description?: string;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        description: string | null;
        icon: string | null;
        createdById: string | null;
        content: Record<string, unknown>;
        plaintext: string;
    }>;
    /** Create a brand-new doc from a template's snapshot content. */
    createDocFromTemplate(workspaceId: string, userId: string, templateId: string, opts?: {
        spaceId?: string | null;
        title?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isArchived: boolean;
        workspaceId: string;
        icon: string | null;
        createdById: string | null;
        archivedAt: Date | null;
        archivedById: string | null;
        spaceId: string | null;
        position: number;
        title: string;
        coverImageUrl: string | null;
        content: Record<string, unknown>;
        parentDocId: string | null;
        plaintext: string;
        publicShareId: string | null;
        publicShareEnabledAt: Date | null;
    }>;
    /** Delete a doc template (workspace-scoped). */
    deleteDocTemplate(workspaceId: string, templateId: string): Promise<{
        ok: boolean;
    }>;
    update(docId: string, userId: string, patch: {
        title?: string;
        icon?: string | null;
        coverImageUrl?: string | null;
        content?: Record<string, unknown>;
        parentDocId?: string | null;
        spaceId?: string | null;
        position?: number;
        isArchived?: boolean;
        expectedUpdatedAt?: string;
    }): Promise<{
        id: string;
        workspaceId: string;
        spaceId: string | null;
        parentDocId: string | null;
        createdById: string | null;
        title: string;
        icon: string | null;
        coverImageUrl: string | null;
        content: Record<string, unknown>;
        plaintext: string;
        position: number;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        publicShareId: string | null;
        publicShareEnabledAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private snapshotRevision;
    listRevisions(docId: string, userId: string): Promise<{
        id: string;
        title: string;
        createdAt: Date;
        updatedAt: Date;
        editor: {
            id: string;
            displayName: string;
            avatarUrl: string | null;
        } | null;
    }[]>;
    getRevision(docId: string, revisionId: string, userId: string): Promise<{
        id: string;
        docId: string;
        workspaceId: string;
        editorId: string | null;
        title: string;
        content: Record<string, unknown>;
        plaintext: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    restoreRevision(docId: string, revisionId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        spaceId: string | null;
        parentDocId: string | null;
        createdById: string | null;
        title: string;
        icon: string | null;
        coverImageUrl: string | null;
        content: Record<string, unknown>;
        plaintext: string;
        position: number;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        publicShareId: string | null;
        publicShareEnabledAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    delete(docId: string, actorId?: string): Promise<{
        ok: boolean;
    }>;
    deleteForUser(docId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Turn on public read-only sharing for the doc. Returns the slug for the
     * /d/<slug> route. Idempotent: returns the existing slug if already shared.
     */
    enablePublicShare(docId: string, userId: string): Promise<{
        publicShareId: string | null;
        publicShareEnabledAt: Date | null;
    }>;
    disablePublicShare(docId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Anonymous lookup by share slug. Returns only the fields safe for public
     * viewers: title, icon, cover, content, updated_at. Comments, ACL state,
     * and member identity are deliberately excluded.
     */
    getByPublicShare(slug: string): Promise<{
        id: string;
        title: string;
        icon: string | null;
        coverImageUrl: string | null;
        content: Record<string, unknown>;
        updatedAt: Date;
    }>;
    listComments(docId: string, userId: string, opts?: {
        includeResolved?: boolean;
    }): Promise<{
        docId: string;
        workspaceId: string;
        comments: {
            id: string;
            docId: string;
            workspaceId: string;
            authorId: string | null;
            parentCommentId: string | null;
            body: string;
            selection: {
                from: number;
                to: number;
                quote?: string;
            } | null;
            isResolved: boolean;
            resolvedById: string | null;
            resolvedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
            authorName: string | null;
            authorEmail: string | null;
            authorAvatarUrl: string | null;
        }[];
    }>;
    createComment(docId: string, userId: string, body: {
        body: string;
        parentCommentId?: string | null;
        selection?: {
            from: number;
            to: number;
            quote?: string;
        } | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        authorId: string | null;
        resolvedAt: Date | null;
        parentCommentId: string | null;
        body: string;
        docId: string;
        selection: {
            from: number;
            to: number;
            quote?: string;
        } | null;
        isResolved: boolean;
        resolvedById: string | null;
    }>;
    /**
     * Notify the doc creator, the parent comment author (for replies), and any
     * @-mentioned workspace members. Always best-effort.
     */
    private notifyDocCommentRecipients;
    /**
     * Extract @-mentions from a comment body and resolve them to workspace
     * member user ids. Mentions match common formats:
     *   - @[Display Name](user:uuid)
     *   - @email@example.com
     *   - bare @username substrings against workspace display names
     */
    private resolveMentions;
    updateComment(commentId: string, userId: string, patch: {
        body?: string;
    }): Promise<{
        id: string;
        docId: string;
        workspaceId: string;
        authorId: string | null;
        parentCommentId: string | null;
        body: string;
        selection: {
            from: number;
            to: number;
            quote?: string;
        } | null;
        isResolved: boolean;
        resolvedById: string | null;
        resolvedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    setCommentResolution(commentId: string, userId: string, resolved: boolean): Promise<{
        id: string;
        docId: string;
        workspaceId: string;
        authorId: string | null;
        parentCommentId: string | null;
        body: string;
        selection: {
            from: number;
            to: number;
            quote?: string;
        } | null;
        isResolved: boolean;
        resolvedById: string | null;
        resolvedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private notifyDocCommentResolved;
    deleteComment(commentId: string, userId: string): Promise<{
        ok: boolean;
    }>;
}
