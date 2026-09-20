import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
export type GroupCreateInput = {
    name: string;
    description?: string | null;
    externalId?: string | null;
    alias?: string | null;
    memberIds?: string[];
};
export type GroupUpdateInput = {
    name?: string;
    description?: string | null;
    externalId?: string | null;
    alias?: string | null;
};
/**
 * §A4.3 — an @-handle has to survive being typed by a human mid-sentence, so it
 * is reduced to the character set a mention parser can bound: lowercase
 * alphanumerics plus `-`/`_`. Returns null when nothing usable survives, which
 * leaves the team un-mentionable rather than reachable under a mangled handle.
 */
export declare function normalizeGroupAlias(raw: string | null | undefined): string | null;
export declare class WorkspaceGroupsService {
    private db;
    private security;
    constructor(db: Db, security: SecurityService);
    list(workspaceId: string, opts?: {
        search?: string;
    }): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
        }[];
        memberCount: number;
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    get(workspaceId: string, groupId: string): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Resolve a group by SCIM externalId or by id, scoped to workspace. */
    findByIdOrExternal(workspaceId: string, key: string): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(workspaceId: string, actorId: string | null, input: GroupCreateInput): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(workspaceId: string, groupId: string, actorId: string | null, input: GroupUpdateInput): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(workspaceId: string, groupId: string, actorId: string | null): Promise<{
        ok: boolean;
    }>;
    addMembers(workspaceId: string, groupId: string, actorId: string | null, userIds: string[]): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    removeMember(workspaceId: string, groupId: string, actorId: string | null, userId: string): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Replace the entire member set. Used by SCIM PUT and by admin bulk edits.
     * Returns the refreshed group payload.
     */
    replaceMembers(workspaceId: string, groupId: string, actorId: string | null, userIds: string[]): Promise<{
        members: {
            userId: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        alias: string | null;
        externalId: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * §V2-12 / frame `21:00` — the per-person work preview cards.
     *
     * The frame draws one card per person: avatar, name, job title, then a
     * NUMBERED list of what that person is working on — Priya Gupta's five items
     * beside Sarah Chang's five different ones. So the whole content of the
     * feature is that each card answers for ITS OWN person.
     *
     * WHICH IS THE PART THAT IS EASY TO FAKE, and this audit has found both
     * halves of the fake in shipped code:
     *
     *   - the FACADE: every card rendering the same list (the caller's own work,
     *     or the first person's), which looks perfect until two people have
     *     different work;
     *   - the CONFIDENT ZERO: a count that is always 0 because the grouping keyed
     *     on the wrong id. In the UI that is indistinguishable from a person who
     *     genuinely has nothing on.
     *
     * So: ONE query for everybody's open work, grouped in memory on
     * `task_assignees.user_id` — the key that was selected, not one reconstructed
     * afterwards — and `openCount` is the true total for that person, not the
     * length of the slice the card shows. A card that says 12 and lists 5 is
     * correct; a card that says 5 because it counted its own list is a number
     * that can never disagree with the list, which makes it decoration.
     *
     * Tasks reach a workspace only through list → project → space, the same join
     * chain the person profile and the activity feed use. `isArchived` covers
     * both archived and trashed tasks (see the note in schema/tasks.ts), so
     * neither shows up as somebody's current work.
     */
    workPreview(workspaceId: string, opts?: {
        perPerson?: number;
    }): Promise<{
        userId: string;
        displayName: string;
        email: string;
        avatarUrl: string | null;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        jobTitle: string | null;
        /** Everything open, not the slice below. */
        openCount: number;
        items: {
            id: string;
            title: string;
            status: string;
            statusCategory: import("@rundesk/db").StatusCategory;
            dueDate: Date | null;
            listId: string;
        }[];
    }[]>;
    /**
     * The job title under the name on a person card.
     *
     * Yours, or anybody's if you administer the workspace. Not a free-for-all:
     * a title is what the org says you do, and letting any colleague rewrite it
     * makes the card unusable as an answer to "who is this".
     *
     * Upsert on (workspace, user) so a second save edits rather than duplicates;
     * clearing it back to NULL is a legitimate answer, distinct from never having
     * been asked, and the card falls back to the workspace role for neither — it
     * simply says nothing.
     */
    setJobTitle(workspaceId: string, actorId: string, userId: string, rawTitle: string | null): Promise<{
        userId: string;
        jobTitle: string | null;
    }>;
    /**
     * Claim a free handle in this workspace, suffixing `-2`, `-3`… on collision.
     * The unique index is still the authority; this only keeps the common case
     * from surfacing as a 409 the admin has to resolve by hand.
     */
    private resolveAlias;
    private assertMembersOfWorkspace;
}
