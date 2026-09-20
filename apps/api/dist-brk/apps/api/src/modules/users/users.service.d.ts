import { users } from '@rundesk/db';
import type { Db } from '@rundesk/db';
import { R2Service } from '../../common/storage/r2.service';
/** Locales the web app ships translations for (Plan §13). */
export declare const SUPPORTED_LOCALES: readonly ["en", "es", "ar", "ur"];
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
/** UI theme preferences (Plan §13.1). 'system' follows the OS setting. */
export declare const THEME_VALUES: readonly ["system", "light", "dark"];
export type ThemePreference = (typeof THEME_VALUES)[number];
/** Date / time / week-start display preferences (Plan §1.2). 'system' follows the browser locale. */
export declare const DATE_FORMAT_VALUES: readonly ["system", "MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "DD MMM YYYY"];
export type DateFormatPreference = (typeof DATE_FORMAT_VALUES)[number];
export declare const TIME_FORMAT_VALUES: readonly ["system", "12h", "24h"];
export type TimeFormatPreference = (typeof TIME_FORMAT_VALUES)[number];
export declare const WEEK_START_VALUES: readonly ["sunday", "monday", "saturday"];
export type WeekStartPreference = (typeof WEEK_START_VALUES)[number];
/**
 * §1.5 / §6 — every top-bar control a member governs.
 *
 * Search and the user menu are deliberately absent: one is the primary way to
 * find anything and the other is how you reach this setting, so hiding either
 * would be a trap. Everything else is the member's call —
 * "yeh option jo hai woh humare members ke paas hona chahiye".
 *
 * §6 [07:55–08:03] — every tool a member can pin to the top bar.
 *
 * She lists what she pins: "yeh task creation ka option hai, yeh timing ka
 * option, yeh document ka, yeh Loom ka, yeh voice recordings ka, yeh
 * whiteboards ka, aur yeh dashboard ka option hai." The first five entries
 * below are the chrome that was already there; the rest are hers.
 *
 * The complaint this answers is [08:29]: "as compared to hum limited de dein
 * ke okay, theek hai, something ke hum ne rakha hai aur woh us ko choose karna
 * parega." A short list we picked is the thing she was objecting to, so adding
 * to this list is how the answer stays answered.
 */
export declare const TOPBAR_ITEMS: readonly ["notifications", "theme", "timer", "ai", "create", "notepad", "docs", "clips", "recordings", "whiteboards", "dashboards"];
export type TopbarItem = (typeof TOPBAR_ITEMS)[number];
/**
 * What a member who has never opened the picker gets.
 *
 * Deliberately small. The point of pinning is that the bar holds what *you*
 * reach for, and a bar preloaded with ten icons has made the choice for you
 * again — just with a longer list.
 */
export declare const DEFAULT_PINNED: TopbarItem[];
/**
 * §1.3 [10:13] — the surfaces whose SECOND-level panel can be collapsed.
 *
 * "yeh DOUBLE NAVIGATION rakhi hui hai… kyunke yeh SPACE leta hai." Chat's
 * channel list and Docs' tree are the two columns that stack against the
 * workspace sidebar and make her point.
 *
 * A whitelist rather than "whatever the client sends", for the same reason
 * TOPBAR_ITEMS is one: `panels_collapsed` is jsonb, and an unchecked object
 * from a request body is a place to park arbitrary data on a user's row.
 */
export declare const COLLAPSIBLE_PANELS: readonly ["chat", "docs"];
export type CollapsiblePanel = (typeof COLLAPSIBLE_PANELS)[number];
/** Hard cap on an uploaded avatar image (Plan §1.2). */
export declare const MAX_AVATAR_BYTES: number;
export declare class UsersService {
    private db;
    private readonly r2;
    constructor(db: Db, r2: R2Service);
    findById(id: string): Promise<{
        id: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        bio: string | null;
        timezone: string;
        timezoneChangeNotice: boolean;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        passwordHash: string | null;
        emailVerified: boolean;
        isActive: boolean;
        failedLoginAttempts: number;
        lockedUntil: Date | null;
        notificationPreferences: unknown;
        lastSeenAt: Date | null;
        presenceStatus: "online" | "away" | "busy" | "offline" | null;
        statusEmoji: string | null;
        statusText: string | null;
        statusExpiresAt: Date | null;
        dndUntil: Date | null;
        highContrast: boolean | null;
        accentColor: string | null;
        locale: string;
        theme: string;
        dateFormat: string;
        timeFormat: string;
        weekStart: string;
        topbarHidden: string[];
        topbarPinned: string[] | null;
        sidebarCollapsed: boolean | null;
        panelsCollapsed: Record<string, boolean> | null;
        plannerSettings: import("@rundesk/db").PlannerSettings | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    findByEmail(email: string): Promise<{
        id: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        bio: string | null;
        timezone: string;
        timezoneChangeNotice: boolean;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        passwordHash: string | null;
        emailVerified: boolean;
        isActive: boolean;
        failedLoginAttempts: number;
        lockedUntil: Date | null;
        notificationPreferences: unknown;
        lastSeenAt: Date | null;
        presenceStatus: "online" | "away" | "busy" | "offline" | null;
        statusEmoji: string | null;
        statusText: string | null;
        statusExpiresAt: Date | null;
        dndUntil: Date | null;
        highContrast: boolean | null;
        accentColor: string | null;
        locale: string;
        theme: string;
        dateFormat: string;
        timeFormat: string;
        weekStart: string;
        topbarHidden: string[];
        topbarPinned: string[] | null;
        sidebarCollapsed: boolean | null;
        panelsCollapsed: Record<string, boolean> | null;
        plannerSettings: import("@rundesk/db").PlannerSettings | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(data: {
        email: string;
        displayName: string;
        passwordHash?: string;
        emailVerified?: boolean;
    }): Promise<{
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        id: string;
        createdAt: Date;
        updatedAt: Date;
        accentColor: string | null;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        bio: string | null;
        timezone: string;
        timezoneChangeNotice: boolean;
        passwordHash: string | null;
        emailVerified: boolean;
        isActive: boolean;
        failedLoginAttempts: number;
        lockedUntil: Date | null;
        notificationPreferences: unknown;
        lastSeenAt: Date | null;
        presenceStatus: "online" | "away" | "busy" | "offline" | null;
        statusEmoji: string | null;
        statusText: string | null;
        statusExpiresAt: Date | null;
        dndUntil: Date | null;
        highContrast: boolean | null;
        locale: string;
        theme: string;
        dateFormat: string;
        timeFormat: string;
        weekStart: string;
        topbarHidden: string[];
        topbarPinned: string[] | null;
        sidebarCollapsed: boolean | null;
        panelsCollapsed: Record<string, boolean> | null;
        plannerSettings: import("@rundesk/db").PlannerSettings | null;
    }>;
    updateProfile(userId: string, patch: {
        displayName?: string;
        bio?: string | null;
        timezone?: string;
        timezoneChangeNotice?: boolean;
        avatarUrl?: string | null;
        locale?: string;
        theme?: string;
        dateFormat?: string;
        timeFormat?: string;
        weekStart?: string;
        topbarHidden?: string[];
        topbarPinned?: string[];
        /** §1.3 — the sidebar collapse, as a preference of the person. */
        sidebarCollapsed?: boolean;
        /** §1.3 [10:13] — the second-level panels, collapsed per surface. */
        panelsCollapsed?: Record<string, boolean>;
        /** §G06 [07:03] — high-contrast text and borders. */
        highContrast?: boolean;
        accentColor?: string | null;
    }): Promise<{
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        id: string;
        createdAt: Date;
        updatedAt: Date;
        accentColor: string | null;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        bio: string | null;
        timezone: string;
        timezoneChangeNotice: boolean;
        emailVerified: boolean;
        isActive: boolean;
        failedLoginAttempts: number;
        lockedUntil: Date | null;
        notificationPreferences: unknown;
        lastSeenAt: Date | null;
        presenceStatus: "online" | "away" | "busy" | "offline" | null;
        statusEmoji: string | null;
        statusText: string | null;
        statusExpiresAt: Date | null;
        dndUntil: Date | null;
        highContrast: boolean | null;
        locale: string;
        theme: string;
        dateFormat: string;
        timeFormat: string;
        weekStart: string;
        topbarHidden: string[];
        topbarPinned: string[] | null;
        sidebarCollapsed: boolean | null;
        panelsCollapsed: Record<string, boolean> | null;
        plannerSettings: import("@rundesk/db").PlannerSettings | null;
    }>;
    /**
     * Presign a direct-to-R2 PUT for a user's avatar image (Plan §1.2). Mirrors
     * the clip/attachment presign flow: validate the image type + size, hand back
     * a short-lived upload URL plus the public URL the client stores via
     * PATCH /users/me. Keys live under `avatars/<userId>-<rand>.<ext>`.
     */
    createAvatarUploadUrl(userId: string, body: {
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        publicUrl: string;
        storageKey: string;
    }>;
    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{
        ok: boolean;
    }>;
    /**
     * GDPR data portability (Plan §14.6). Assemble a JSON bundle of everything we
     * hold that is personal to THIS user: their profile, their workspace/org
     * memberships, the tasks they authored or are assigned to, their comments, and
     * their time entries. Strictly scoped to the requesting user's own data —
     * secrets (password hash, OAuth tokens) are never included.
     */
    exportUserData(userId: string): Promise<{
        format: string;
        exportedAt: string;
        profile: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            createdAt: Date;
            updatedAt: Date;
            accentColor: string | null;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            timezoneChangeNotice: boolean;
            emailVerified: boolean;
            isActive: boolean;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            notificationPreferences: unknown;
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
            statusEmoji: string | null;
            statusText: string | null;
            statusExpiresAt: Date | null;
            dndUntil: Date | null;
            highContrast: boolean | null;
            locale: string;
            theme: string;
            dateFormat: string;
            timeFormat: string;
            weekStart: string;
            topbarHidden: string[];
            topbarPinned: string[] | null;
            sidebarCollapsed: boolean | null;
            panelsCollapsed: Record<string, boolean> | null;
            plannerSettings: import("@rundesk/db").PlannerSettings | null;
        };
        memberships: {
            workspaces: {
                workspaceId: string;
                name: string;
                slug: string;
                role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
                joinedAt: Date;
            }[];
            organizations: {
                organizationId: string;
                name: string;
                slug: string;
                role: "member" | "owner" | "admin" | "billing";
                joinedAt: Date;
            }[];
        };
        tasks: {
            created: {
                id: string;
                title: string;
                status: string;
                createdAt: Date;
            }[];
            assigned: {
                taskId: string;
                title: string;
                assignedAt: Date;
            }[];
        };
        comments: {
            id: string;
            taskId: string;
            body: string;
            createdAt: Date;
        }[];
        timeEntries: {
            id: string;
            taskId: string;
            startedAt: Date;
            endedAt: Date | null;
            durationSec: number | null;
            description: string | null;
            isBillable: boolean;
        }[];
        connectedAccounts: {
            provider: "google" | "microsoft";
            connectedAt: Date;
        }[];
        counts: {
            workspaces: number;
            organizations: number;
            tasksCreated: number;
            tasksAssigned: number;
            comments: number;
            timeEntries: number;
        };
    }>;
    /**
     * GDPR right to erasure (Plan §14.6). Irreversibly anonymizes the account:
     * scrubs all PII from the users row, deletes sessions (revokes access), OAuth
     * links, task assignments and every workspace/org membership. Authored content
     * (tasks, comments, time entries) is retained but de-identified — the FKs point
     * at a scrubbed, de-membered row, preserving workspace integrity without
     * keeping the person identifiable.
     *
     * Safety guards (never orphan an org/workspace):
     *   - Requires typing the exact account email to confirm.
     *   - Refuses to delete the last active super admin.
     *   - Refuses to delete the last admin of any workspace (transfer admin first).
     */
    deleteAccount(userId: string, confirmation: {
        confirmEmail?: string;
    }): Promise<{
        ok: true;
        anonymized: true;
        userId: string;
    }>;
    publicProfile(user: typeof users.$inferSelect): {
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        id: string;
        createdAt: Date;
        updatedAt: Date;
        accentColor: string | null;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        bio: string | null;
        timezone: string;
        timezoneChangeNotice: boolean;
        emailVerified: boolean;
        isActive: boolean;
        failedLoginAttempts: number;
        lockedUntil: Date | null;
        notificationPreferences: unknown;
        lastSeenAt: Date | null;
        presenceStatus: "online" | "away" | "busy" | "offline" | null;
        statusEmoji: string | null;
        statusText: string | null;
        statusExpiresAt: Date | null;
        dndUntil: Date | null;
        highContrast: boolean | null;
        locale: string;
        theme: string;
        dateFormat: string;
        timeFormat: string;
        weekStart: string;
        topbarHidden: string[];
        topbarPinned: string[] | null;
        sidebarCollapsed: boolean | null;
        panelsCollapsed: Record<string, boolean> | null;
        plannerSettings: import("@rundesk/db").PlannerSettings | null;
    };
    /**
     * §6 frame `087_0535` — the Notepad from Personal Tools.
     *
     * Read returns '' rather than 404 for somebody who has never written in it:
     * an empty scratch pad and a missing one are the same thing to a person, and
     * a 404 here would make the panel render an error on first open.
     */
    getNotepad(userId: string): Promise<{
        content: string;
        updatedAt: Date;
    }>;
    saveNotepad(userId: string, content: string): Promise<{
        content: string;
        updatedAt: Date;
    }>;
}
