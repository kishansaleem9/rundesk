import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
export interface SeedSummary {
    spaces: number;
    projects: number;
    lists: number;
    tasks: number;
    subtasks: number;
    checklistItems: number;
    labels: number;
    docs: number;
    goals: number;
}
/**
 * Generates a realistic, opinionated demo workspace so brand-new
 * workspaces have something to explore instead of an empty shell.
 *
 * The seeder is intentionally **idempotent-by-refusal** — if the
 * workspace already has any spaces, the call rejects with a 409.
 * That keeps it safe to expose to admins while preventing accidental
 * duplication.
 */
export declare class SampleDataService {
    private readonly db;
    private readonly security;
    private readonly logger;
    constructor(db: Db, security: SecurityService);
    seed(workspaceId: string, actor: {
        id: string;
        email?: string;
    }): Promise<SeedSummary>;
    private assertEmpty;
    private requireActorMembership;
    /**
     * Workspace-scoped label palette used across the seeded tasks.
     * Hand-picked so a fresh workspace gets a sensible default set
     * users can build on.
     */
    private readonly LABEL_DEFS;
    private createLabels;
    /**
     * Drives the bulk of the seed. Picks 3 spaces × 2 projects ×
     * 4 lists, then layers tasks per (project, list) pair using a
     * recipe table so the demo feels curated rather than random.
     */
    private createTree;
    private seedDefaultStatuses;
    private createTask;
    private createDocs;
    private createGoals;
}
