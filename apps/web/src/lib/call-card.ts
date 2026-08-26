import type { TranslationKey } from './i18n'

/**
 * §2.8 gap 9 — the call card in the channel, `[19:25-19:57, 21:10]`.
 *
 *   "You're in the SyncUp / Wait for your team to join!" … "SyncUp Ended /
 *   Lasted 45s · 1 person joined" … "Join the SyncUp"
 *
 * The card is not a record of what happened when the call started. It is read
 * an hour later, by somebody who may or may not be in that call right now, and
 * it has to say the right one of three different things. That decision is here
 * rather than tangled into the message list, because the wrong branch shows a
 * live Join button on a call that ended last Tuesday.
 */

export interface CallCardState {
  startedAt: string
  endedAt: string | null
  joinedCount: number
  presentCount: number
  youArePresent: boolean
}

export type CallCardMode = 'in' | 'joinable' | 'ended'

export function callCardMode(call: CallCardState): CallCardMode {
  if (call.endedAt) return 'ended'
  // Being in it wins over being able to join it: a Join button on a call you
  // are already in is the clearest possible way to say the card is wrong.
  return call.youArePresent ? 'in' : 'joinable'
}

/** The heading, per mode. */
export function callCardTitleKey(mode: CallCardMode): TranslationKey {
  if (mode === 'in') return 'callCard.youAreIn'
  if (mode === 'ended') return 'callCard.ended'
  return 'callCard.join'
}

/**
 * "Lasted 45s", "Lasted 3m 12s", "Lasted 1h 5m".
 *
 * Seconds are dropped past an hour — nobody reads "1h 5m 22s" — but kept below
 * a minute, where "0m" would be worse than useless. Anything that comes out
 * negative (a clock that disagrees with the server's) is reported as under a
 * second rather than as a call that lasted minus four seconds.
 */
export function formatCallDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 1000) return '0s'
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/**
 * The line under the heading.
 *
 * Each mode answers a different question, and the counts they use are
 * different too: a live call cares who is in it NOW, an ended one cares how
 * many people were ever in it.
 */
export function callCardSubtitle(call: CallCardState): {
  key: TranslationKey
  vars?: Record<string, string | number>
} {
  const mode = callCardMode(call)
  if (mode === 'ended') {
    return {
      key: 'callCard.endedDetail',
      vars: {
        duration: formatCallDuration(call.startedAt, call.endedAt!),
        count: call.joinedCount,
      },
    }
  }
  if (mode === 'in') {
    // "Wait for your team to join!" only while you are actually alone in it.
    return call.presentCount <= 1
      ? { key: 'callCard.waitForTeam' }
      : { key: 'callCard.inWithOthers', vars: { count: call.presentCount - 1 } }
  }
  return call.presentCount === 0
    ? { key: 'callCard.nobodyIn' }
    : { key: 'callCard.peopleIn', vars: { count: call.presentCount } }
}

/** Whether the Join button does anything. Disabled on an ended call. */
export function canJoinFromCard(call: CallCardState): boolean {
  return callCardMode(call) === 'joinable'
}
