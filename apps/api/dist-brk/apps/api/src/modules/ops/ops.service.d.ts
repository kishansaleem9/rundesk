import type { Db } from '@rundesk/db';
export type OpsMetrics = {
    billingConfigured: boolean;
    totalOrganizations: number;
    totalActiveUsers: number;
    totalStorageBytes: number;
    totalAiCostUsd: number;
    mrrUsd: number;
    arrUsd: number;
    arpaUsd: number;
    ltvUsd: number;
    churnRatePct: number;
    activeSubscriptions: number;
    canceledSubscriptions: number;
    subscriptionsByTier: Record<string, number>;
    subscriptionsByStatus: Record<string, number>;
    generatedAt: string;
};
export type OpsOrgRow = {
    id: string;
    name: string;
    slug: string;
    plan: string | null;
    subscriptionStatus: string | null;
    activeUsers: number;
    totalUsers: number;
    storageBytes: number;
    aiCostUsd: number;
    mrrUsd: number;
    churnRisk: boolean;
    createdAt: Date | null;
};
export declare class OpsService {
    private db;
    constructor(db: Db);
    /** All subscription rows (workspace-scoped) with the fields the metrics need. */
    private loadSubscriptions;
    /** Map workspaceId → number of workspace_members (a subscription's "seats"). */
    private loadSeatsByWorkspace;
    /** Map workspaceId → organizationId. */
    private loadWorkspaceOrgs;
    /** Task-attachment storage bytes per organization (grouped aggregate). */
    private loadTaskStorageByOrg;
    /** Chat-attachment storage bytes per organization (grouped aggregate). */
    private loadChatStorageByOrg;
    /**
     * AI cost (USD) per organization over the last 30 days. Token sums are grouped
     * per (org, model) in SQL, then priced in JS via the shared estimateAiCostUsd
     * (same cost model as ai.service).
     */
    private loadAiCostByOrg;
    /**
     * Per-org total members and active members. Active = distinct members whose
     * user.last_seen_at is within the last 30 days (evaluated in Postgres).
     */
    private loadUsersByOrg;
    /** Global distinct active users (last_seen_at within 30 days). */
    private loadGlobalActiveUsers;
    /**
     * Platform-wide summary. See the class doc for the degrade-to-zero contract.
     *
     * Revenue model:
     *   MRR   = Σ over ACTIVE subs of seatPrice[tier] × seats(workspace_members)
     *   ARR   = MRR × 12
     *   ARPA  = MRR / activeSubscriptions            (0 when no active subs)
     *   churn = canceled / (active + canceled) × 100 (0 when no subs)
     *   LTV   = ARPA / (churn/100); when churn is 0 we cap LTV at ARPA × 36
     *           (a 3-year modeled ceiling), and guard NaN/Infinity → 0.
     */
    getMetrics(): Promise<OpsMetrics>;
    /**
     * Per-organization rows (newest-org first). `plan`/`subscriptionStatus` come
     * from the org's most relevant ACTIVE subscription (highest modeled seat price)
     * or null when the org has no active subscription. `churnRisk` flags an org if
     * ANY of its subscriptions is at risk (cancel_at_period_end, past_due, etc).
     */
    getOrganizations(): Promise<OpsOrgRow[]>;
}
