import type { Db } from '@rundesk/db';
export declare class HealthController {
    private db;
    private readonly startedAt;
    constructor(db: Db);
    live(): {
        status: string;
        uptimeMs: number;
        timestamp: string;
    };
    ready(): Promise<{
        status: string;
        checks: Record<string, {
            ok: boolean;
            latencyMs?: number;
            error?: string;
        }>;
        timestamp: string;
    }>;
}
