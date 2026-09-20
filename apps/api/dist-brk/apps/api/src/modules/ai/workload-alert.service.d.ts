import { AiService } from './ai.service';
import { NotificationsService } from '../notifications/notifications.service';
/**
 * §7.12 — proactive workload alerts. A daily guarded check that, per workspace
 * with open work, flags anyone significantly overloaded relative to the team and
 * notifies that workspace's managers/admins with a `workload_alert` notification
 * deep-linking to the insights page. Deduped so the same overloaded person can't
 * spam managers day after day (a prior alert within the dedupe window suppresses
 * a re-send). All computation reuses AiService's real per-assignee load query and
 * the pure `findOverloadedAssignees` selector, so it is testable without a model.
 */
export declare class WorkloadAlertService {
    private ai;
    private notifications;
    private readonly logger;
    constructor(ai: AiService, notifications: NotificationsService);
    runDaily(): Promise<{
        workspaces: number;
        alerts: number;
    }>;
    /**
     * Scan every workspace with open work, alert managers about overloaded
     * teammates, and skip anyone alerted within the dedupe window. Returns counts
     * so tests/ops can assert selection. Best-effort per workspace.
     */
    dispatch(now?: Date): Promise<{
        workspaces: number;
        alerts: number;
    }>;
    /** Alert managers about newly-overloaded teammates in one workspace. Returns # alerted people. */
    checkWorkspace(workspaceId: string, now?: Date): Promise<number>;
}
