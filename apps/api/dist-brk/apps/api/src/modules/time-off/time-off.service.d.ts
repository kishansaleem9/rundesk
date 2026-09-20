import type { Db } from '@rundesk/db';
export type TimeOffInput = {
    userId?: string;
    startsOn: string;
    endsOn: string;
    note?: string | null;
};
/**
 * §A4.10 Days off. ClickUp models workweeks, working hours, holiday calendars
 * and team days off; for an agency only the last one changes a decision, so this
 * stores exactly that and feeds it to the workload heat-map.
 */
export declare class TimeOffService {
    private db;
    constructor(db: Db);
    /**
     * Every entry overlapping [from, to] for the workspace. Availability is a team
     * fact — you cannot plan around leave you cannot see — so this is not scoped
     * to the caller.
     */
    list(workspaceId: string, range?: {
        from?: string;
        to?: string;
    }): Promise<{
        id: string;
        userId: string;
        startsOn: string;
        endsOn: string;
        note: string | null;
        displayName: string;
        email: string;
    }[]>;
    create(workspaceId: string, actor: {
        id: string;
        isManager: boolean;
    }, input: TimeOffInput): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        userId: string;
        createdById: string | null;
        note: string | null;
        startsOn: string;
        endsOn: string;
    }>;
    remove(workspaceId: string, entryId: string, actor: {
        id: string;
        isManager: boolean;
    }): Promise<{
        ok: boolean;
    }>;
}
