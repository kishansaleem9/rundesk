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

  // For an authenticated user the server preference is source of truth: adopt it
  // once on load (cross-device), overriding the local guess.
  useEffect(() => {
    if (!useAuthStore.getState().accessToken) return
    let cancelled = false
    api<{ locale?: string }>('/users/me')
      .then((me) => {
        if (!cancelled && isSupported(me.locale)) {
          setLocaleState(me.locale)
          try { localStorage.setItem(STORAGE_KEY, me.locale) } catch { /* ignore */ }
        }
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    // Persist to the account so it follows the user across devices (best-effort).
    if (useAuthStore.getState().accessToken) {
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
