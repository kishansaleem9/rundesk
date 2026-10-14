import type { PlanId } from '../plans/plans.constants'

/**
 * §8 — the numbers Imports / Exports runs by, keyed by plan so a tier can be
 * given different ones without touching the engine.
 *
 * `importsPerDay` is null (unlimited) on enterprise: that tier is never
 * restricted by plan gating (`plans.constants.ts`), and it is the default for
 * every existing workspace. The file limits are the same everywhere — they are
 * the importer's own limits, not a plan's.
 */
export type ImportLimits = {
  importsPerDay: number | null
  maxRows: number
  /** Created items may be deleted as a unit for this many days. */
  deletableDays: number
  /** Uploaded rows ("Download file") are kept this long, then purged. */
  sourceRetentionDays: number
  /** Export download links expire this long after they are made. */
  exportLinkSeconds: number
  /** Rows written per transaction. */
  batchSize: number
}

const BASE: ImportLimits = {
  importsPerDay: 60,
  maxRows: 10_000,
  deletableDays: 10,
  sourceRetentionDays: 30,
  exportLinkSeconds: 3_600,
  batchSize: 500,
}

export const IMPORT_LIMITS: Record<PlanId, ImportLimits> = {
  free: BASE,
  pro: BASE,
  business: BASE,
  enterprise: { ...BASE, importsPerDay: null },
}

export function importLimitsFor(plan: PlanId | string | null | undefined): ImportLimits {
  return IMPORT_LIMITS[(plan as PlanId) ?? 'enterprise'] ?? IMPORT_LIMITS.enterprise
}

/** A run that has not written a heartbeat for this long is taken over by the recovery sweep. */
export const STALE_RUN_MS = 2 * 60_000
