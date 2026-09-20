import { DocsService } from './docs.service';
import type { CurrentUserPayload } from '../tasks/types';
/**
 * Anonymous public-share endpoint. Lives at the root path so the slug is
 * stable and shareable as a clean URL. No auth guard so /d/<slug> works
 * for any visitor with the link.
 */
export declare class DocsPublicController {
    private docs;
    constructor(docs: DocsService);
    getPublic(slug: string): Promise<{
        id: string;
        title: string;
        icon: string | null;
        coverImageUrl: string | null;
        content: Record<string, unknown>;
        updatedAt: Date;
    }>;
}
export declare class DocsController {
    private docs;
    constructor(docs: DocsService);
    list(workspaceId: string, user: CurrentUserPayload, spaceId?: string, parentDocId?: string, scope?: string): Promise<{
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
    scopeCounts(workspaceId: string, user: CurrentUserPayload): Promise<{
        all: number;
        mine: number;
        shared: number;
        archived: number;
    }>;
    create(workspaceId: string, user: CurrentUserPayload, body: {
        spaceId?: string | null;
        parentDocId?: string | null;
        title?: string;
        icon?: string;
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
    listTemplates(workspaceId: string): Promise<{
        id: string;
        name: string;
        description: string | null;
        icon: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    saveTemplate(workspaceId: string, user: CurrentUserPayload, body: {
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
    createFromTemplate(workspaceId: string, templateId: string, user: CurrentUserPayload, body: {
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
    deleteTemplate(workspaceId: string, templateId: string): Promise<{
        ok: boolean;
    }>;
    get(docId: string, user: CurrentUserPayload): Promise<{
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
     * §V2-10 — the other end of a task↔doc link.
     *
     * `[06:15]` "acha, is document ka yeh task hai". The task side has existed
     * since relationships shipped; the doc side was never read, so linking from a
     * task and then opening the doc showed no sign of it.
     */
    linkedTasks(docId: string, user: CurrentUserPayload): Promise<{
        id: string;
        taskId: string;
        title: string;
        status: string;
        statusCategory: import("@rundesk/db").StatusCategory;
        listId: string;
        linkedAt: Date;
    }[]>;
    exportDoc(docId: string, user: CurrentUserPayload, res: any, format?: string): Promise<void>;
    update(docId: string, user: CurrentUserPayload, body: {
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
    remove(docId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    enableShare(docId: string, user: CurrentUserPayload): Promise<{
        publicShareId: string | null;
        publicShareEnabledAt: Date | null;
    }>;
    disableShare(docId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    listRevisions(docId: string, user: CurrentUserPayload): Promise<{
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
    getRevision(docId: string, revisionId: string, user: CurrentUserPayload): Promise<{
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
    restoreRevision(docId: string, revisionId: string, user: CurrentUserPayload): Promise<{
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
    listComments(docId: string, user: CurrentUserPayload, includeResolved?: string): Promise<{
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
    createComment(docId: string, user: CurrentUserPayload, body: {
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
    updateComment(commentId: string, user: CurrentUserPayload, body: {
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
    resolveComment(commentId: string, user: CurrentUserPayload, body: {
        resolved?: boolean;
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
    removeComment(commentId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
