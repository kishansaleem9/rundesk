import { estimateAiCostUsd } from './ai-cost'

/**
 * AI CREDITS, AS CLICKUP COUNTS THEM (`commit-log/log-3943965-1`, `ledger-rows/row-869`).
 *
 * ClickUp (help centre, "New plans and pricing options", "Which features are
 * included with the AI add-ons?", "Purchase or track ClickUp AI Super
 * Credits"; read 12 October): each user brings a monthly number of AI credits,
 * pooled across the workspace; they do not roll over and renew each month; a
 * credit is a tenth of a cent, and more are bought in $10 packs; the workspace
 * is warned at 80% and at 100% of its credits, and past 100% AI pauses until
 * the month renews or credits are bought. Pure, so the arithmetic is
 * unit-tested without a database.
 */

export const USD_PER_CREDIT = 0.001
export const CREDITS_PER_PACK = 10_000
export const CENTS_PER_PACK = 1_000
/** At most this many packs in one purchase. */
export const MAX_PACKS = 100
/** The workspace is warned from this share of its credits on. */
export const WARN_AT = 0.8

/**
 * What a call costs in credits: its estimated cost at a tenth of a cent a
 * credit, and never nothing — a call the model answered used something.
 */
export function creditsFor(model: string, inputTokens: number, outputTokens: number): number {
  return Math.max(1, Math.ceil(estimateAiCostUsd(model, inputTokens, outputTokens) / USD_PER_CREDIT - 1e-9))
}

/** The month a use counts in — the calendar month, in UTC — and when the next begins. */
export function creditMonth(now: Date): { start: Date; renewsAt: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const renewsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, renewsAt }
}

export type CreditState = {
  /** The month's credits: the members' share and what was bought, or null for unlimited. */
  allowance: number | null
  used: number
  left: number | null
  /** Used, as a whole percentage of the allowance (null for unlimited). */
  percent: number | null
  /** `unlimited`; `ok`; `warning` from 80%; `paused` once used up. */
  state: 'unlimited' | 'ok' | 'warning' | 'paused'
}

export function creditState(input: { perMember: number | null; members: number; purchased: number; used: number }): CreditState {
  const used = Math.max(0, input.used)
  if (input.perMember == null) return { allowance: null, used, left: null, percent: null, state: 'unlimited' }
  const allowance = Math.max(0, input.perMember * Math.max(0, input.members) + Math.max(0, input.purchased))
  const left = Math.max(0, allowance - used)
  const percent = allowance === 0 ? 100 : Math.min(100, Math.floor((used / allowance) * 100))
  const state = used >= allowance ? 'paused' : used >= allowance * WARN_AT ? 'warning' : 'ok'
  return { allowance, used, left, percent, state }
}

/** The words AI is paused with, naming when it comes back. */
export function creditsPausedMessage(renewsAt: Date): string {
  const when = renewsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  return `This workspace has used all of its AI credits for this month — AI is paused until they renew on ${when}, or an admin adds credits`
}

/** A purchase's packs: a whole number of them, one to `MAX_PACKS`. */
export function packsFor(credits: unknown): number | null {
  if (typeof credits !== 'number' || !Number.isInteger(credits) || credits <= 0 || credits % CREDITS_PER_PACK !== 0) return null
  const packs = credits / CREDITS_PER_PACK
  return packs >= 1 && packs <= MAX_PACKS ? packs : null
}

/** Each day of the month so far, with the credits used that day and up to it. */
export function dailySeries(
  month: { start: Date },
  now: Date,
  byDay: ReadonlyArray<{ day: string; credits: number }>,
): Array<{ day: string; credits: number; cumulative: number }> {
  const got = new Map(byDay.map((r) => [r.day, r.credits]))
  const out: Array<{ day: string; credits: number; cumulative: number }> = []
  let total = 0
  for (let d = new Date(month.start); d <= now; d = new Date(d.getTime() + 86_400_000)) {
    const day = d.toISOString().slice(0, 10)
    const credits = got.get(day) ?? 0
    total += credits
    out.push({ day, credits, cumulative: total })
  }
  return out
}
