import type { TranslationKey } from './i18n'

/**
 * §2.8 gap 11 — what a gated feature says for itself.
 *
 *   `[20:45]` "back end se on karna parta hai" — recording is off until an
 *   admin turns it on, and the person who wants it is not that admin.
 *
 * Rundesk's gated features simply did not render: no modal, no explanation,
 * nothing to press. A feature that is switched off should say so and give the
 * person a way forward — which means the "Contact your admin" button has an
 * outcome, and the outcome has to be said out loud rather than swallowed into
 * a generic success.
 */

/** What the server did with the request. `failed` is the client's own. */
export type GateOutcome = 'sent' | 'already_enabled' | 'already_asked' | 'no_admins' | 'failed'

export interface GateResult {
  status: GateOutcome
  notified: number
}

/**
 * Turn the outcome into the line the modal shows.
 *
 * `sent` with nobody notified is its own case and not a success: it means every
 * admin has muted this kind of notification, so the request went nowhere. A
 * cheerful "we told them" there would be a lie the person acts on.
 */
export function gateMessageKey(result: GateResult): TranslationKey {
  switch (result.status) {
    case 'sent':
      return result.notified > 0 ? 'gate.sent' : 'gate.sentButSilent'
    case 'already_asked':
      return 'gate.alreadyAsked'
    case 'no_admins':
      return 'gate.noAdmins'
    case 'already_enabled':
      return 'gate.nowOn'
    default:
      return 'gate.failed'
  }
}

/** Only a fresh, delivered request should stop the button being pressed again. */
export function canAskAgain(result: GateResult | null): boolean {
  if (!result) return true
  if (result.status === 'already_asked') return false
  return !(result.status === 'sent' && result.notified > 0)
}
