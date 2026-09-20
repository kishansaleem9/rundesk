import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
declare const LocalStrategy_base: new (...args: [] | [options: import("passport-local").IStrategyOptionsWithRequest] | [options: import("passport-local").IStrategyOptions]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class LocalStrategy extends LocalStrategy_base {
    private authService;
    constructor(authService: AuthService);
    validate(email: string, password: string): Promise<{
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
}
export {};
