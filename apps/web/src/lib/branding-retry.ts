import { retryAfterSeconds } from './api'

/**
 * When to ask for a custom domain's branding again, in ms, or null to stop:
 * once, after a refusal for too many requests, when it asks to wait a minute
 * or less. A custom domain's first visitors are one address behind many
 * offices, and a refused lookup used to fall back to the plain app for the
 * whole visit (`found-30-sep/public-pages-read-429-as-gone`). Kept apart from
 * custom-domain.ts, which reads the build's env at load.
 */
export function brandingRetryDelayMs(error: unknown, attempt: number): number | null {
  const seconds = retryAfterSeconds(error)
  if (seconds === null || attempt > 0 || seconds > 60) return null
  return seconds * 1000
}
