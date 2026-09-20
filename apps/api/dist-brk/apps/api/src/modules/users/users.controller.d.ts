import { UsersService } from './users.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class UsersController {
    private users;
    constructor(users: UsersService);
    me(user: CurrentUserPayload): Promise<{
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
    } | null>;
    updateProfile(user: CurrentUserPayload, body: {
        displayName?: string;
        bio?: string | null;
        timezone?: string;
        avatarUrl?: string | null;
        locale?: string;
        theme?: string;
        dateFormat?: string;
        timeFormat?: string;
        weekStart?: string;
        topbarHidden?: string[];
        topbarPinned?: string[];
        sidebarCollapsed?: boolean;
        panelsCollapsed?: Record<string, boolean>;
        highContrast?: boolean;
        timezoneChangeNotice?: boolean;
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
    presignAvatar(user: CurrentUserPayload, body: {
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        publicUrl: string;
        storageKey: string;
    }>;
    changePassword(user: CurrentUserPayload, body: {
        currentPassword: string;
        newPassword: string;
    }): Promise<{
        ok: boolean;
    }>;
    exportData(user: CurrentUserPayload): Promise<{
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
    deleteMe(user: CurrentUserPayload, body: {
        confirmEmail?: string;
    }): Promise<{
        ok: true;
        anonymized: true;
        userId: string;
    }>;
    deleteMeViaPost(user: CurrentUserPayload, body: {
        confirmEmail?: string;
    }): Promise<{
        ok: true;
        anonymized: true;
        userId: string;
    }>;
    /**
     * §6 frame `087_0535` — the Notepad from Personal Tools.
     *
     * A scratch pad belongs to the person, not a workspace, so it hangs off
     * /users/me like their theme and their pinned tools rather than off a
     * workspace route that would strand a note when they switch.
     */
    getNotepad(user: CurrentUserPayload): Promise<{
        content: string;
        updatedAt: Date;
    }>;
    saveNotepad(user: CurrentUserPayload, body: {
        content?: string;
    }): Promise<{
        content: string;
        updatedAt: Date;
    }>;
}
