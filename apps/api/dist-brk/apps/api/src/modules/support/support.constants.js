"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLA_MATRIX = exports.SLA_POLICY = exports.INCIDENT_STATUSES = exports.COMPONENT_STATUSES = exports.TICKET_PRIORITIES = exports.TICKET_STATUSES = void 0;
exports.slaPolicyFor = slaPolicyFor;
exports.normalizePriority = normalizePriority;
exports.normalizeStatus = normalizeStatus;
exports.computeSlaDueDates = computeSlaDueDates;
exports.computeSlaBreach = computeSlaBreach;
const plans_constants_1 = require("../plans/plans.constants");
/** Allowed ticket lifecycle statuses. */
exports.TICKET_STATUSES = [
    'open',
    'pending',
    'resolved',
    'closed',
];
/** Allowed ticket priorities (also the SLA policy keys). */
exports.TICKET_PRIORITIES = [
    'low',
    'normal',
    'high',
    'urgent',
];
/** Allowed status-page component health values. */
exports.COMPONENT_STATUSES = [
    'operational',
    'degraded',
    'partial_outage',
    'major_outage',
];
/** Allowed status-page incident lifecycle values. */
exports.INCIDENT_STATUSES = [
    'investigating',
    'identified',
    'monitoring',
    'resolved',
];
/**
 * SLA policy per priority. Higher priority ⇒ tighter clocks. Numbers are hours;
 * the resolution values map to 1d / 3d / 5d / 7d.
 *
 *   urgent → first response 4h,  resolution 1d (24h)
 *   high   → first response 8h,  resolution 3d (72h)
 *   normal → first response 24h, resolution 5d (120h)
 *   low    → first response 48h, resolution 7d (168h)
 */
exports.SLA_POLICY = {
    urgent: { firstResponseHours: 4, resolutionHours: 24 },
    high: { firstResponseHours: 8, resolutionHours: 72 },
    normal: { firstResponseHours: 24, resolutionHours: 120 },
    low: { firstResponseHours: 48, resolutionHours: 168 },
};
/**
 * SLA commitments BY TIER × priority (Plan §14.4). Higher-paying tiers get
 * tighter clocks: for every priority, `enterprise < business < pro < free` on
 * both first-response and resolution hours. `pro` intentionally equals the
 * legacy priority-only SLA_POLICY, which is also the fallback used whenever the
 * workspace's tier is unknown (see `slaPolicyFor`) — so behavior for an
 * unresolved plan is exactly the pre-tier policy.
 */
exports.SLA_MATRIX = {
    enterprise: {
        urgent: { firstResponseHours: 1, resolutionHours: 8 },
        high: { firstResponseHours: 2, resolutionHours: 24 },
        normal: { firstResponseHours: 8, resolutionHours: 48 },
        low: { firstResponseHours: 24, resolutionHours: 96 },
    },
    business: {
        urgent: { firstResponseHours: 2, resolutionHours: 12 },
        high: { firstResponseHours: 4, resolutionHours: 48 },
        normal: { firstResponseHours: 12, resolutionHours: 72 },
        low: { firstResponseHours: 36, resolutionHours: 120 },
    },
    pro: {
        urgent: { firstResponseHours: 4, resolutionHours: 24 },
        high: { firstResponseHours: 8, resolutionHours: 72 },
        normal: { firstResponseHours: 24, resolutionHours: 120 },
        low: { firstResponseHours: 48, resolutionHours: 168 },
    },
    free: {
        urgent: { firstResponseHours: 8, resolutionHours: 48 },
        high: { firstResponseHours: 24, resolutionHours: 120 },
        normal: { firstResponseHours: 48, resolutionHours: 168 },
        low: { firstResponseHours: 72, resolutionHours: 240 },
    },
};
/**
 * Resolve the SLA target for a (tier, priority) pair. An unknown/undefined tier
 * falls back to the legacy priority-only SLA_POLICY so callers that can't resolve
 * a plan keep the current behavior. An unknown priority falls back to 'normal'.
 */
function slaPolicyFor(tier, priority) {
    const table = (0, plans_constants_1.isPlanId)(tier) ? exports.SLA_MATRIX[tier] : exports.SLA_POLICY;
    return table[priority] ?? exports.SLA_POLICY.normal;
}
const HOUR_MS = 60 * 60 * 1000;
/** Coerce an arbitrary input into a valid priority, defaulting to 'normal'. */
function normalizePriority(value) {
    return exports.TICKET_PRIORITIES.includes(value)
        ? value
        : 'normal';
}
/** Coerce an arbitrary input into a valid status, defaulting to 'open'. */
function normalizeStatus(value) {
    return exports.TICKET_STATUSES.includes(value)
        ? value
        : 'open';
}
/**
 * Compute the SLA due dates for a ticket of a given priority (and, optionally,
 * plan tier) relative to a base time (creation). Pure + deterministic so it's
 * directly unit-testable. When `tier` is omitted/unknown it uses the legacy
 * priority-only policy, preserving pre-tier behavior.
 */
function computeSlaDueDates(priority, from = new Date(), tier) {
    const policy = slaPolicyFor(tier, priority);
    return {
        firstResponseDueAt: new Date(from.getTime() + policy.firstResponseHours * HOUR_MS),
        resolutionDueAt: new Date(from.getTime() + policy.resolutionHours * HOUR_MS),
    };
}
/**
 * Derive SLA-breach flags for a ticket. A first-response breach is a due date in
 * the past with no first_response_at stamped. A resolution breach is a due date
 * in the past with the ticket not yet resolved/closed. Closed/resolved tickets
 * never report a first-response breach retroactively once answered.
 */
function computeSlaBreach(ticket, now = new Date()) {
    const isDone = ticket.status === 'resolved' || ticket.status === 'closed';
    const firstResponseBreached = !ticket.firstResponseAt && now.getTime() > ticket.firstResponseDueAt.getTime();
    const resolutionBreached = !isDone && !ticket.resolvedAt && now.getTime() > ticket.resolutionDueAt.getTime();
    return {
        firstResponseBreached,
        resolutionBreached,
        breached: firstResponseBreached || resolutionBreached,
    };
}
//# sourceMappingURL=support.constants.js.map