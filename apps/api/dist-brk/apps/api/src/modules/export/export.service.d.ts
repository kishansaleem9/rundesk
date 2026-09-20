import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
export declare class ExportService {
    private db;
    private readonly security;
    constructor(db: Db, security: SecurityService);
    exportWorkspace(workspaceId: string, actor?: {
        id: string;
        role?: string;
    }): Promise<{
        workspace: object;
        members: object[];
        spaces: object[];
        projects: object[];
        lists: object[];
        tasks: object[];
        goals: object[];
        sprints: object[];
        forms: object[];
        exportedAt: string;
    }>;
    logExport(workspaceId: string, actorId: string, format: 'json' | 'csv', scope: string, counts?: Record<string, number>, ipAddress?: string): Promise<void>;
    /**
     * §A4.1 roster export. Takes the same rows the People screen renders, so the
     * spreadsheet an admin hands to finance or an auditor can never disagree with
     * what is on screen.
     */
    membersToCsv(members: Array<{
        displayName: string;
        email: string;
        role: string;
        weeklyCapacityHours?: number | null;
        teams?: string[];
        joinedAt?: Date | string | null;
        invitedAt?: Date | string | null;
        invitedByName?: string | null;
        lastSeenAt?: Date | string | null;
    }>): string;
    exportToCsv(tasks: any[]): string;
}
