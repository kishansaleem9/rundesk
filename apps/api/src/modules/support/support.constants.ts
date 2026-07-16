import type {
  SupportTicketStatus,
  SupportTicketPriority,
  StatusComponentStatus,
  StatusIncidentStatus,
} from '@rundesk/db'
import { isPlanId, type PlanId } from '../plans/plans.constants'

/** Allowed ticket lifecycle statuses. */
export const TICKET_STATUSES: readonly SupportTicketStatus[] = [
  'open',
  'pending',
  'resolved',
  'closed',
] as const

/** Allowed ticket priorities (also the SLA policy keys). */
export const TICKET_PRIORITIES: readonly SupportTicketPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
] as const

/** Allowed status-page component health values. */
export const COMPONENT_STATUSES: readonly StatusComponentStatus[] = [
  'operational',
  'degraded',
  'partial_outage',
  'major_outage',
] as const

/** Allowed status-page incident lifecycle values. */
export const INCIDENT_STATUSES: readonly StatusIncidentStatus[] = [
  'investigating',
  'identified',
  'monitoring',
  'resolved',
] as const

/**
 * SLA policy per priority. Higher priority ⇒ tighter clocks. Numbers are hours;
 * the resolution values map to 1d / 3d / 5d / 7d.
 *
 *   urgent → first response 4h,  resolution 1d (24h)
 *   high   → first response 8h,  resolution 3d (72h)
 *   normal → first response 24h, resolution 5d (120h)
 *   low    → first response 48h, resolution 7d (168h)
 */
export const SLA_POLICY: Record<
  SupportTicketPriority,
  { firstResponseHours: number; resolutionHours: number }
> = {
  urgent: { firstResponseHours: 4, resolutionHours: 24 },
  high: { firstResponseHours: 8, resolutionHours: 72 },
  normal: { firstResponseHours: 24, resolutionHours: 120 },
  low: { firstResponseHours: 48, resolutionHours: 168 },
}

/** One priority row of an SLA table. */
export type SlaTarget = { firstResponseHours: number; resolutionHours: number }

/**
 * SLA commitments BY TIER × priority (Plan §14.4). Higher-paying tiers get
 * tighter clocks: for every priority, `enterprise < business < pro < free` on
 * both first-response and resolution hours. `pro` intentionally equals the
 * legacy priority-only SLA_POLICY, which is also the fallback used whenever the
 * workspace's tier is unknown (see `slaPolicyFor`) — so behavior for an
 * unresolved plan is exactly the pre-tier policy.
 */
export const SLA_MATRIX: Record<PlanId, Record<SupportTicketPriority, SlaTarget>> = {
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
}

/**
 * Resolve the SLA target for a (tier, priority) pair. An unknown/undefined tier
 * falls back to the legacy priority-only SLA_POLICY so callers that can't resolve
 * a plan keep the current behavior. An unknown priority falls back to 'normal'.
 */
export function slaPolicyFor(
  tier: PlanId | string | null | undefined,
  priority: SupportTicketPriority,
): SlaTarget {
  const table = isPlanId(tier) ? SLA_MATRIX[tier] : SLA_POLICY
  return table[priority] ?? SLA_POLICY.normal
}

const HOUR_MS = 60 * 60 * 1000

/** Coerce an arbitrary input into a valid priority, defaulting to 'normal'. */
export function normalizePriority(value: unknown): SupportTicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value as string)
    ? (value as SupportTicketPriority)
    : 'normal'
}

/** Coerce an arbitrary input into a valid status, defaulting to 'open'. */
export function normalizeStatus(value: unknown): SupportTicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value as string)
    ? (value as SupportTicketStatus)
    : 'open'
}

/**
 * Compute the SLA due dates for a ticket of a given priority (and, optionally,
 * plan tier) relative to a base time (creation). Pure + deterministic so it's
 * directly unit-testable. When `tier` is omitted/unknown it uses the legacy
 * priority-only policy, preserving pre-tier behavior.
 */
export function computeSlaDueDates(
  priority: SupportTicketPriority,
  from: Date = new Date(),
  tier?: PlanId | string | null,
): { firstResponseDueAt: Date; resolutionDueAt: Date } {
  const policy = slaPolicyFor(tier, priority)
  return {
    firstResponseDueAt: new Date(from.getTime() + policy.firstResponseHours * HOUR_MS),
    resolutionDueAt: new Date(from.getTime() + policy.resolutionHours * HOUR_MS),
  }
}

/** The two SLA-breach flags exposed on ticket reads. */
export type SlaFlags = {
  firstResponseBreached: boolean
  resolutionBreached: boolean
  breached: boolean
}

/**
 * Derive SLA-breach flags for a ticket. A first-response breach is a due date in
 * the past with no first_response_at stamped. A resolution breach is a due date
 * in the past with the ticket not yet resolved/closed. Closed/resolved tickets
 * never report a first-response breach retroactively once answered.
 */
export function computeSlaBreach(
  ticket: {
    status: string
    firstResponseAt: Date | null
    resolvedAt: Date | null
    firstResponseDueAt: Date
    resolutionDueAt: Date
  },
  now: Date = new Date(),
): SlaFlags {
  const isDone = ticket.status === 'resolved' || ticket.status === 'closed'

  const firstResponseBreached =
    !ticket.firstResponseAt && now.getTime() > ticket.firstResponseDueAt.getTime()

  const resolutionBreached =
    !isDone && !ticket.resolvedAt && now.getTime() > ticket.resolutionDueAt.getTime()

  return {
    firstResponseBreached,
    resolutionBreached,
    breached: firstResponseBreached || resolutionBreached,
  }
}
