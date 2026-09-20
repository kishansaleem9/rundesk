import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
/** Everything that can be shared. */
export declare const SHARE_TYPES: readonly ["space", "folder", "project", "list", "task", "doc", "channel", "dashboard", "view"];
export type ShareType = (typeof SHARE_TYPES)[number];
/**
 * Access levels, weakest → strongest. Mirrors ClickUp:
 *   view < comment < edit < admin ("full edit")
 * `edit` may change the item but NOT delete it; `admin` may delete.
 */
export declare const SHARE_LEVELS: readonly ["view", "comment", "edit", "admin"];
export type ShareLevel = (typeof SHARE_LEVELS)[number];
export interface ShareRow {
    id: string;
    level: ShareLevel;
    user: {
        id: string;
        name: string;
        email: string;
        avatarUrl: string | null;
    } | null;
    /** Set instead of `user` while an invited outsider has not signed up yet. */
    invitedEmail: string | null;
    createdAt: string;
}
/** One hit of the reverse "everything shared with me" lookup (A1.7). */
export interface SharedWithMeItem {
    id: string;
    objectType: ShareType;
    objectId: string;
    level: ShareLevel;
    name: string;
    /** In-app deep link. */
    url: string;
    /** Where it lives, for telling two same-named lists apart. */
    context: string | null;
    sharedAt: string;
    sharedBy: {
        id: string;
        name: string;
        avatarUrl: string | null;
    } | null;
}
export declare class SharesService {
    private db;
    private security;
    private email;
    private config;
    private notifications;
    private readonly logger;
    constructor(db: Db, security: SecurityService, email: EmailService, config: ConfigService, notifications: NotificationsService);
    assertType(t: string): ShareType;
    private assertLevel;
    /**
     * Resolve an object to its workspace, creator and ancestor chain, ordered
     * MOST specific first. Permission resolution walks this list and stops at the
     * first explicit grant — task beats list beats project beats folder beats space.
     */
    private locate;
    /**
     * The grant on EXACTLY this object, ignoring ancestors.
     *
     * `resolveLevel` deliberately inherits down the chain, which is right for
     * containers but wrong for a private chat channel: a space-level grant must
     * not quietly open every private channel inside that space. Callers guarding
     * private things ask for the direct grant instead.
     */
    directLevel(type: ShareType, id: string, userId: string): Promise<ShareLevel | null>;
    private workspaceRole;
    /**
     * Sharing rights are a function of (level, user type) — not level alone.
     * A member with edit+ on the object may share it; a GUEST may never share,
     * even with edit. Admins/managers and the object's creator may always share.
     */
    canShare(type: ShareType, id: string, actor: {
        id: string;
        role?: string;
    }): Promise<{
        allowed: boolean;
        loc: {
            workspaceId: string;
            createdById: string | null;
            name: string;
            chain: Array<{
                type: ShareType;
                id: string;
            }>;
        };
    }>;
    private assertCanShare;
    /**
     * The level a user has on an object, or null if nothing was granted anywhere
     * up the chain. Most specific wins: the first ancestor with an explicit grant
     * decides, so a task-level grant overrides a broader space-level one.
     */
    resolveLevel(type: ShareType, id: string, userId: string): Promise<ShareLevel | null>;
    /** True when the level permits deleting the object itself (edit must not). */
    canDelete(level: ShareLevel | null): level is "admin";
    /** The address to notify for a grant made against a known user. */
    private emailOf;
    list(type: ShareType, id: string, actor: {
        id: string;
        role?: string;
    }): Promise<ShareRow[]>;
    /**
     * Names + deep links for one batch of same-typed shared objects.
     *
     * Deliberately does NOT apply the per-item visibility filters
     * (`item-visibility.ts`): those hide private rows from everyone but the
     * creator and managers, and an explicit share grant is precisely the
     * exception they don't know about. Reaching this code already means the
     * caller holds a row in `object_shares` naming them.
     */
    private resolveSharedBatch;
    /**
     * Everything in a workspace someone has shared *with* the caller — the
     * reverse of the object-keyed routes, and the only way to find a privately
     * shared item without being sent a link. Newest grant first.
     *
     * Grants whose object has since been deleted are skipped rather than
     * reported: `object_shares.object_id` is polymorphic, so no foreign key
     * cleans them up.
     */
    listSharedWithMe(workspaceId: string, userId: string): Promise<SharedWithMeItem[]>;
    /**
     * Grant access by user id OR by email. An email that matches an existing
     * workspace user is bound straight to that user; anything else is stored as a
     * pending invite so an OUTSIDER can be shared with before they sign up.
     */
    share(type: ShareType, id: string, actor: {
        id: string;
        role?: string;
    }, input: {
        userId?: string;
        email?: string;
        level?: string;
    }, ip?: string): Promise<{
        ok: boolean;
        updated: boolean;
        id?: undefined;
    } | {
        ok: boolean;
        id: string;
        updated?: undefined;
    }>;
    updateLevel(type: ShareType, id: string, shareId: string, actor: {
        id: string;
        role?: string;
    }, level: string, ip?: string): Promise<{
        ok: boolean;
    }>;
    revoke(type: ShareType, id: string, shareId: string, actor: {
        id: string;
        role?: string;
    }, ip?: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Bind pending email invites to a user once they exist (call on signup /
     * accept), so an outsider who was shared with before signing up lands with
     * their access already in place.
     */
    claimInvites(userId: string, email: string): Promise<{
        claimed: number;
    }>;
    /**
     * §G10 [12:16–12:20] — "someone asked for access to something".
     *
     * The `access_requested` notification kind has existed since the enum was
     * written and was only ever emitted for FEATURE requests. Somebody who hit a
     * doc, list or space they could not see had no way to ask for it — the wall
     * was the end of the road.
     *
     * Modelled on the feature-flag request flow rather than reinvented, because
     * that one already learned two things the hard way, and both apply here.
     */
    requestAccess(workspaceId: string, type: ShareType, objectId: string, requester: {
        id: string;
        name?: string | null;
        email?: string | null;
    }): Promise<{
        status: 'sent' | 'already_asked' | 'no_owners';
        notified: number;
    }>;
}
