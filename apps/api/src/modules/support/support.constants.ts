import type {
  SupportTicketStatus,
  SupportTicketPriority,
  StatusComponentStatus,
  StatusIncidentStatus,
} from '@rundesk/db'

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
 * Compute the SLA due dates for a ticket of a given priority relative to a base
 * time (creation). Pure + deterministic so it's directly unit-testable.
 */
export function computeSlaDueDates(
  priority: SupportTicketPriority,
  from: Date = new Date(),
): { firstResponseDueAt: Date; resolutionDueAt: Date } {
  const policy = SLA_POLICY[priority] ?? SLA_POLICY.normal
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
