import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../lib/api'
import { useAuthStore } from './auth'

export type Theme = 'light' | 'dark' | 'system'

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
  /** Apply a server-sourced preference on load WITHOUT echoing it back. */
  hydrateTheme: (theme: Theme) => void

  /**
   * §G06 [07:03] — "High Contrast for increased accessibility".
   *
   * Kept beside the theme rather than in its own store because it is the same
   * kind of answer — how the app should look for this person, wherever they
   * sign in — and because both have to be applied to <html> before first paint
   * or the screen visibly changes under the reader.
   */
  highContrast: boolean
  setHighContrast: (on: boolean) => void
  hydrateHighContrast: (on: boolean) => void
}

/**
 * Cross-device persistence (Plan §13.1): mirror the choice to the server so it
 * follows the user to other devices. Fire-and-forget — the toggle stays instant
 * and offline-safe — and only when authenticated (avoids a pointless 401 on the
 * login screen). The server value is re-hydrated on the next load.
 */
function persistTheme(theme: Theme) {
  if (!useAuthStore.getState().isAuthenticated()) return
  void api('/users/me', { method: 'PATCH', body: { theme } }).catch(() => {})
}

const prefersDark = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches

/** Resolve 'system' to the OS preference (Plan §13 dark-mode detection). */
export const resolveTheme = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme

const applyTheme = (theme: Theme) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const resolved = resolveTheme(theme)
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
}

/**
 * §G06 [07:03] — one class on <html>, and the stylesheet does the rest.
 *
 * A class rather than a token swap in JS: every colour in this app is already
 * a CSS variable, so the accessible thing to do is redefine the variables
 * under one selector and let every component inherit it — rather than teach a
 * hundred components a second palette they can each get wrong.
 */
const applyHighContrast = (on: boolean) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('high-contrast', on)
}

function persistHighContrast(on: boolean) {
  if (!useAuthStore.getState().isAuthenticated()) return
  void api('/users/me', { method: 'PATCH', body: { highContrast: on } }).catch(() => {})
}

let systemListenerAttached = false
const attachSystemListener = (getTheme: () => Theme) => {
  if (systemListenerAttached || typeof window === 'undefined' || !window.matchMedia) return
  systemListenerAttached = true
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    // Only follow the OS when the user has chosen 'system'.
    if (getTheme() === 'system') applyTheme('system')
  })
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
        persistTheme(theme)
      },
      // Cycle light → dark → system → light.
      toggle: () => {
        const order: Theme[] = ['light', 'dark', 'system']
        const next = order[(order.indexOf(get().theme) + 1) % order.length]
        applyTheme(next)
        set({ theme: next })
        persistTheme(next)
      },
      // Applied from GET /users/me on load; must not re-PATCH the server.
      hydrateTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },

      highContrast: false,
      setHighContrast: (on) => {
        applyHighContrast(on)
        set({ highContrast: on })
        persistHighContrast(on)
      },
      hydrateHighContrast: (on) => {
        applyHighContrast(on)
        set({ highContrast: on })
      },
    }),
    {
      name: 'rundesk.theme',
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'system')
        applyHighContrast(state?.highContrast === true)
        attachSystemListener(() => useThemeStore.getState().theme)
      },
    },
  ),
)
