import type { Db } from '@rundesk/db';
import { TimeOffService, type TimeOffInput } from './time-off.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class TimeOffController {
    private readonly timeOff;
    private readonly db;
    constructor(timeOff: TimeOffService, db: Db);
    list(workspaceId: string, from?: string, to?: string): Promise<{
        id: string;
        userId: string;
        startsOn: string;
        endsOn: string;
        note: string | null;
        displayName: string;
        email: string;
    }[]>;
    create(workspaceId: string, user: CurrentUserPayload, body: TimeOffInput): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        userId: string;
        createdById: string | null;
        note: string | null;
        startsOn: string;
        endsOn: string;
    }>;
    remove(workspaceId: string, entryId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    private actor;
}
