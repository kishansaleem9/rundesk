"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const ai_cost_1 = require("../ai/ai-cost");
/**
 * §14.5 SaaS Ops Dashboard (Internal) — super-admin, cross-tenant platform
 * metrics. READ-ONLY analytics over existing tables (no migration). Everything
 * degrades gracefully to zeros/empty when the tables are empty (e.g. no Stripe
 * configured) — this service never throws.
 */
/**
 * Modeled per-seat monthly list price (USD) by tier. Pro/Business match the
 * marketing site's landing page ($12 / $24). Enterprise is "Custom" on the site,
 * so we use $40 as an explicit modeled list rate for internal revenue modeling.
 */
const SEAT_PRICE_USD = {
    free: 0,
    pro: 12,
    business: 24,
    enterprise: 40,
};
// A subscription entitles revenue only while ACTIVE; CANCELED feeds churn.
const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const CANCELED_STATUSES = new Set(['canceled', 'incomplete_expired', 'unpaid']);
const CHURN_RISK_STATUSES = new Set(['past_due', 'canceled', 'unpaid']);
function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
/** Round to 2 decimals, coercing NaN/±Infinity to 0. */
function round2(n) {
    if (!Number.isFinite(n))
        return 0;
    return Math.round(n * 100) / 100;
}
function seatPrice(tier) {
    return SEAT_PRICE_USD[tier] ?? 0;
}
function isChurnRisk(s) {
    return s.cancelAtPeriodEnd === true || CHURN_RISK_STATUSES.has(s.status);
}
let OpsService = class OpsService {
    constructor(db) {
        this.db = db;
    }
    /** All subscription rows (workspace-scoped) with the fields the metrics need. */
    async loadSubscriptions() {
        const rows = await this.db
            .select({
            workspaceId: db_1.subscriptions.workspaceId,
            status: db_1.subscriptions.status,
            tier: db_1.subscriptions.tier,
            cancelAtPeriodEnd: db_1.subscriptions.cancelAtPeriodEnd,
        })
            .from(db_1.subscriptions);
        return rows.map((r) => ({
            workspaceId: r.workspaceId ?? null,
            status: r.status,
            tier: r.tier,
            cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd),
        }));
    }
    /** Map workspaceId → number of workspace_members (a subscription's "seats"). */
    async loadSeatsByWorkspace() {
        const rows = await this.db
            .select({
            workspaceId: db_1.workspaceMembers.workspaceId,
            seats: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(db_1.workspaceMembers)
            .groupBy(db_1.workspaceMembers.workspaceId);
        const m = new Map();
        for (const r of rows)
            m.set(r.workspaceId, num(r.seats));
        return m;
    }
    /** Map workspaceId → organizationId. */
    async loadWorkspaceOrgs() {
        const rows = await this.db
            .select({ id: db_1.workspaces.id, organizationId: db_1.workspaces.organizationId })
            .from(db_1.workspaces);
        const m = new Map();
        for (const r of rows)
            m.set(r.id, r.organizationId);
        return m;
    }
    /** Task-attachment storage bytes per organization (grouped aggregate). */
    async loadTaskStorageByOrg() {
        const rows = await this.db
            .select({
            organizationId: db_1.workspaces.organizationId,
            bytes: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.taskAttachments.sizeBytes}), 0)`,
        })
            .from(db_1.taskAttachments)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAttachments.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, db_1.spaces.workspaceId))
            .groupBy(db_1.workspaces.organizationId);
        const m = new Map();
        for (const r of rows)
            m.set(r.organizationId, num(r.bytes));
        return m;
    }
    /** Chat-attachment storage bytes per organization (grouped aggregate). */
    async loadChatStorageByOrg() {
        const rows = await this.db
            .select({
            organizationId: db_1.workspaces.organizationId,
            bytes: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.chatMessageAttachments.sizeBytes}), 0)`,
        })
            .from(db_1.chatMessageAttachments)
            .innerJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessageAttachments.channelId))
            .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, db_1.chatChannels.workspaceId))
            .groupBy(db_1.workspaces.organizationId);
        const m = new Map();
        for (const r of rows)
            m.set(r.organizationId, num(r.bytes));
        return m;
    }
    /**
     * AI cost (USD) per organization over the last 30 days. Token sums are grouped
     * per (org, model) in SQL, then priced in JS via the shared estimateAiCostUsd
     * (same cost model as ai.service).
     */
    async loadAiCostByOrg() {
        const rows = await this.db
            .select({
            organizationId: db_1.workspaces.organizationId,
            model: db_1.aiUsage.model,
            inTok: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.aiUsage.inputTokens}), 0)`,
            outTok: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.aiUsage.outputTokens}), 0)`,
        })
            .from(db_1.aiUsage)
            .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, db_1.aiUsage.workspaceId))
            .where((0, drizzle_orm_1.sql) `${db_1.aiUsage.createdAt} >= now() - interval '30 days'`)
            .groupBy(db_1.workspaces.organizationId, db_1.aiUsage.model);
        const m = new Map();
        for (const r of rows) {
            const cost = (0, ai_cost_1.estimateAiCostUsd)(r.model, num(r.inTok), num(r.outTok));
            m.set(r.organizationId, (m.get(r.organizationId) ?? 0) + cost);
        }
        return m;
    }
    /**
     * Per-org total members and active members. Active = distinct members whose
     * user.last_seen_at is within the last 30 days (evaluated in Postgres).
     */
    async loadUsersByOrg() {
        const rows = await this.db
            .select({
            organizationId: db_1.organizationMembers.organizationId,
            total: (0, drizzle_orm_1.sql) `count(distinct ${db_1.users.id})::int`,
            active: (0, drizzle_orm_1.sql) `count(distinct ${db_1.users.id}) filter (where ${db_1.users.lastSeenAt} >= now() - interval '30 days')::int`,
        })
            .from(db_1.organizationMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.organizationMembers.userId))
            .groupBy(db_1.organizationMembers.organizationId);
        const m = new Map();
        for (const r of rows)
            m.set(r.organizationId, { total: num(r.total), active: num(r.active) });
        return m;
    }
    /** Global distinct active users (last_seen_at within 30 days). */
    async loadGlobalActiveUsers() {
        const [row] = await this.db
            .select({ c: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.users)
            .where((0, drizzle_orm_1.sql) `${db_1.users.lastSeenAt} >= now() - interval '30 days'`);
        return num(row?.c);
    }
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
    async getMetrics() {
        const [subs, seatsByWs, totalOrgRow, totalActiveUsers, storageTask, storageChat, aiCostByOrg] = await Promise.all([
            this.loadSubscriptions(),
            this.loadSeatsByWorkspace(),
            this.db.select({ c: (0, drizzle_orm_1.sql) `count(*)::int` }).from(db_1.organizations),
            this.loadGlobalActiveUsers(),
            this.loadTaskStorageByOrg(),
            this.loadChatStorageByOrg(),
            this.loadAiCostByOrg(),
        ]);
        const totalOrganizations = num(totalOrgRow[0]?.c);
        let mrr = 0;
        let activeCount = 0;
        let canceledCount = 0;
        const byTier = {};
        const byStatus = {};
        for (const s of subs) {
            byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
            if (ACTIVE_STATUSES.has(s.status)) {
                activeCount += 1;
                byTier[s.tier] = (byTier[s.tier] ?? 0) + 1;
                const seats = s.workspaceId ? (seatsByWs.get(s.workspaceId) ?? 0) : 0;
                mrr += seatPrice(s.tier) * seats;
            }
            else if (CANCELED_STATUSES.has(s.status)) {
                canceledCount += 1;
            }
        }
        const arr = mrr * 12;
        const arpa = activeCount > 0 ? mrr / activeCount : 0;
        const churnDenom = activeCount + canceledCount;
        const churnRatePct = churnDenom > 0 ? (canceledCount / churnDenom) * 100 : 0;
        // LTV = ARPA / churn-fraction. With zero churn the geometric series diverges,
        // so we cap at a 3-year (36-month) modeled lifetime.
        const ltv = churnRatePct > 0 ? arpa / (churnRatePct / 100) : arpa * 36;
        let totalStorageBytes = 0;
        for (const b of storageTask.values())
            totalStorageBytes += b;
        for (const b of storageChat.values())
            totalStorageBytes += b;
        let totalAiCostUsd = 0;
        for (const c of aiCostByOrg.values())
            totalAiCostUsd += c;
        return {
            billingConfigured: subs.length >= 1,
            totalOrganizations,
            totalActiveUsers,
            totalStorageBytes,
            totalAiCostUsd: round2(totalAiCostUsd),
            mrrUsd: round2(mrr),
            arrUsd: round2(arr),
            arpaUsd: round2(arpa),
            ltvUsd: round2(ltv),
            churnRatePct: round2(churnRatePct),
            activeSubscriptions: activeCount,
            canceledSubscriptions: canceledCount,
            subscriptionsByTier: byTier,
            subscriptionsByStatus: byStatus,
            generatedAt: new Date().toISOString(),
        };
    }
    /**
     * Per-organization rows (newest-org first). `plan`/`subscriptionStatus` come
     * from the org's most relevant ACTIVE subscription (highest modeled seat price)
     * or null when the org has no active subscription. `churnRisk` flags an org if
     * ANY of its subscriptions is at risk (cancel_at_period_end, past_due, etc).
     */
    async getOrganizations() {
        const [orgs, subs, seatsByWs, wsToOrg, usersByOrg, storageTask, storageChat, aiCostByOrg] = await Promise.all([
            this.db
                .select({
                id: db_1.organizations.id,
                name: db_1.organizations.name,
                slug: db_1.organizations.slug,
                createdAt: db_1.organizations.createdAt,
            })
                .from(db_1.organizations)
                .orderBy((0, drizzle_orm_1.sql) `${db_1.organizations.createdAt} desc`),
            this.loadSubscriptions(),
            this.loadSeatsByWorkspace(),
            this.loadWorkspaceOrgs(),
            this.loadUsersByOrg(),
            this.loadTaskStorageByOrg(),
            this.loadChatStorageByOrg(),
            this.loadAiCostByOrg(),
        ]);
        // Group subscriptions by organization (via workspace → org).
        const subsByOrg = new Map();
        for (const s of subs) {
            if (!s.workspaceId)
                continue;
            const orgId = wsToOrg.get(s.workspaceId);
            if (!orgId)
                continue;
            const list = subsByOrg.get(orgId) ?? [];
            list.push(s);
            subsByOrg.set(orgId, list);
        }
        return orgs.map((o) => {
            const orgSubs = subsByOrg.get(o.id) ?? [];
            const activeSubs = orgSubs.filter((s) => ACTIVE_STATUSES.has(s.status));
            // Most relevant active subscription = highest modeled seat price.
            let best = null;
            for (const s of activeSubs) {
                if (!best || seatPrice(s.tier) > seatPrice(best.tier))
                    best = s;
            }
            // Per-org MRR = Σ active subs' seatPrice × seats (consistent with global MRR).
            let mrr = 0;
            for (const s of activeSubs) {
                const seats = s.workspaceId ? (seatsByWs.get(s.workspaceId) ?? 0) : 0;
                mrr += seatPrice(s.tier) * seats;
            }
            const churnRisk = orgSubs.some(isChurnRisk);
            const u = usersByOrg.get(o.id) ?? { total: 0, active: 0 };
            const storageBytes = (storageTask.get(o.id) ?? 0) + (storageChat.get(o.id) ?? 0);
            return {
                id: o.id,
                name: o.name,
                slug: o.slug,
                plan: best ? best.tier : null,
                subscriptionStatus: best ? best.status : null,
                activeUsers: u.active,
                totalUsers: u.total,
                storageBytes,
                aiCostUsd: round2(aiCostByOrg.get(o.id) ?? 0),
                mrrUsd: round2(mrr),
                churnRisk,
                createdAt: o.createdAt ?? null,
            };
        });
    }
};
exports.OpsService = OpsService;
exports.OpsService = OpsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], OpsService);
//# sourceMappingURL=ops.service.js.map