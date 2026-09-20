import type { SupportTicketStatus, SupportTicketPriority, StatusComponentStatus, StatusIncidentStatus } from '@rundesk/db';
import { type PlanId } from '../plans/plans.constants';
/** Allowed ticket lifecycle statuses. */
export declare const TICKET_STATUSES: readonly SupportTicketStatus[];
/** Allowed ticket priorities (also the SLA policy keys). */
export declare const TICKET_PRIORITIES: readonly SupportTicketPriority[];
/** Allowed status-page component health values. */
export declare const COMPONENT_STATUSES: readonly StatusComponentStatus[];
/** Allowed status-page incident lifecycle values. */
export declare const INCIDENT_STATUSES: readonly StatusIncidentStatus[];
/**
 * SLA policy per priority. Higher priority ⇒ tighter clocks. Numbers are hours;
 * the resolution values map to 1d / 3d / 5d / 7d.
 *
 *   urgent → first response 4h,  resolution 1d (24h)
 *   high   → first response 8h,  resolution 3d (72h)
 *   normal → first response 24h, resolution 5d (120h)
 *   low    → first response 48h, resolution 7d (168h)
 */
export declare const SLA_POLICY: Record<SupportTicketPriority, {
    firstResponseHours: number;
    resolutionHours: number;
}>;
/** One priority row of an SLA table. */
export type SlaTarget = {
    firstResponseHours: number;
    resolutionHours: number;
};
/**
 * SLA commitments BY TIER × priority (Plan §14.4). Higher-paying tiers get
 * tighter clocks: for every priority, `enterprise < business < pro < free` on
 * both first-response and resolution hours. `pro` intentionally equals the
 * legacy priority-only SLA_POLICY, which is also the fallback used whenever the
 * workspace's tier is unknown (see `slaPolicyFor`) — so behavior for an
 * unresolved plan is exactly the pre-tier policy.
 */
export declare const SLA_MATRIX: Record<PlanId, Record<SupportTicketPriority, SlaTarget>>;
/**
 * Resolve the SLA target for a (tier, priority) pair. An unknown/undefined tier
 * falls back to the legacy priority-only SLA_POLICY so callers that can't resolve
 * a plan keep the current behavior. An unknown priority falls back to 'normal'.
 */
export declare function slaPolicyFor(tier: PlanId | string | null | undefined, priority: SupportTicketPriority): SlaTarget;
/** Coerce an arbitrary input into a valid priority, defaulting to 'normal'. */
export declare function normalizePriority(value: unknown): SupportTicketPriority;
/** Coerce an arbitrary input into a valid status, defaulting to 'open'. */
export declare function normalizeStatus(value: unknown): SupportTicketStatus;
/**
 * Compute the SLA due dates for a ticket of a given priority (and, optionally,
 * plan tier) relative to a base time (creation). Pure + deterministic so it's
 * directly unit-testable. When `tier` is omitted/unknown it uses the legacy
 * priority-only policy, preserving pre-tier behavior.
 */
export declare function computeSlaDueDates(priority: SupportTicketPriority, from?: Date, tier?: PlanId | string | null): {
    firstResponseDueAt: Date;
    resolutionDueAt: Date;
};
/** The two SLA-breach flags exposed on ticket reads. */
export type SlaFlags = {
    firstResponseBreached: boolean;
    resolutionBreached: boolean;
    breached: boolean;
};
/**
 * Derive SLA-breach flags for a ticket. A first-response breach is a due date in
 * the past with no first_response_at stamped. A resolution breach is a due date
 * in the past with the ticket not yet resolved/closed. Closed/resolved tickets
 * never report a first-response breach retroactively once answered.
 */
export declare function computeSlaBreach(ticket: {
    status: string;
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
    firstResponseDueAt: Date;
    resolutionDueAt: Date;
}, now?: Date): SlaFlags;
