/**
 * Whether this browser can install Rundesk, and the one chance it gives you.
 *
 * `beforeinstallprompt` fires once, early, and the event is only usable if you
 * called `preventDefault()` on it and kept it. It was captured inside the
 * install banner, which meant nothing else could ever offer to install — and
 * `[07:28]` she opens "Download app" from the profile menu, not from a banner
 * that may already have been dismissed.
 *
 * So the event lives here instead, and both surfaces read the same one.
 *
 * Deliberately NOT a promise of installability. Plenty of browsers never fire
 * the event at all — every iOS browser, anything already installed, Firefox —
 * and an "Install app" entry that does nothing in those is worse than no entry,
 * which is why `canInstall()` gates the menu rather than the click.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

const announce = () => {
  for (const fn of listeners) fn()
}

/** Start listening. Safe to call more than once; only the first call binds. */
let bound = false
export function watchForInstallPrompt(): void {
  if (bound || typeof window === 'undefined') return
  bound = true
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without preventDefault the browser shows its own mini-infobar and the
    // event becomes unusable, so this is what makes an in-app offer possible.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    announce()
  })
  // Once installed there is nothing left to offer, and the entry should go.
  window.addEventListener('appinstalled', () => {
    deferred = null
    announce()
  })
}

export function canInstall(): boolean {
  return deferred !== null
}

/** Subscribe to installability changing. Returns an unsubscribe. */
export function onInstallabilityChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Ask the browser to install. Resolves to what the person chose, or `null` if
 * there was never an offer to make.
 *
 * The event is single-use: once prompted it cannot be replayed, so it is
 * cleared either way rather than left as a button that silently stops working.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  if (!deferred) return null
  const event = deferred
  deferred = null
  announce()
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome
  } catch {
    return null
  }
}
