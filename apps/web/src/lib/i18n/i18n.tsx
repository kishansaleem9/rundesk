import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { type Locale, type TranslationKey } from './catalogs'
import {
  translate,
  translateCount,
  directionFor,
  isSupportedLocale,
  SUPPORTED_LOCALES,
  type Direction,
  type Vars,
} from './translate'
import { api } from '../api'
import { useAuthStore } from '../../store/auth'

const STORAGE_KEY = 'rundesk.locale'

const SUPPORTED = SUPPORTED_LOCALES
const isSupported = isSupportedLocale

/** localStorage → browser language → English. */
function detectInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isSupported(saved)) return saved
  } catch {
    // ignore storage errors
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en'
  return isSupported(nav) ? nav : 'en'
}

/** Reflect the locale onto <html> so CSS + the browser pick up language + direction. */
function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = directionFor(locale)
}

// ── React context ───────────────────────────────────────────────────────────

type I18nContextValue = {
  locale: Locale
  dir: Direction
  locales: Locale[]
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, vars?: Vars) => string
  tCount: (base: string, count: number, vars?: Vars) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale)

  // Keep <html lang/dir> in sync with the active locale.
  useEffect(() => {
    applyDocumentLocale(locale)
  }, [locale])

  /*
   * For a signed-in person the server preference is the source of truth: adopt
   * it on load, overriding the local guess, so the language follows them across
   * devices.
   *
   * READ WHY THE TEST IS `isAuthenticated()` AND NOT `accessToken`. This used
   * to be gated on `accessToken`, which was right when the token was persisted.
   * The session then moved to an httpOnly cookie and `partialize` stopped
   * saving tokens on purpose — so `accessToken` is null on every page load, the
   * guard returned early every single time, and the saved language was never
   * applied to anybody. Nothing failed and nothing was logged; the product just
   * quietly spoke English to a person who had chosen Urdu, which is the same
   * class of defect as §V2-05's transcription writing Urdu in Devanagari. The
   * store's own comment names the right test: "we treat the presence of a
   * hydrated user profile as logged in".
   */
  useEffect(() => {
    let cancelled = false
    const adopt = () => {
      if (!useAuthStore.getState().isAuthenticated()) return false
      api<{ locale?: string }>('/users/me')
        .then((me) => {
          if (!cancelled && isSupported(me.locale)) {
            setLocaleState(me.locale)
            try { localStorage.setItem(STORAGE_KEY, me.locale) } catch { /* ignore */ }
          }
        })
        .catch(() => undefined)
      return true
    }
    if (adopt()) return () => { cancelled = true }
    /*
     * Not signed in yet. Signing in does not remount this provider — the router
     * navigates in place — so without watching the store, somebody who chose
     * Urdu would stay in English for the whole session they just started, and
     * only get their language on the next full page load.
     */
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (state.user && !previous.user) {
        if (adopt()) unsubscribe()
      }
    })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    // Persist to the account so it follows the user across devices (best-effort).
    // Same guard, and it was dead for the same reason — picking a language used
    // to change this browser and nothing else.
    if (useAuthStore.getState().isAuthenticated()) {
      void api('/users/me', { method: 'PATCH', body: { locale: next } }).catch(() => undefined)
    }
  }, [])

  const t = useCallback((key: TranslationKey, vars?: Vars) => translate(locale, key, vars), [locale])
  const tCount = useCallback((base: string, count: number, vars?: Vars) => translateCount(locale, base, count, vars), [locale])

  return (
    <I18nContext.Provider value={{ locale, dir: directionFor(locale), locales: SUPPORTED, setLocale, t, tCount }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useTranslation must be used within <I18nProvider>')
  return ctx
}
