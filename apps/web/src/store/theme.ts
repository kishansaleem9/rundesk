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
    }),
    {
      name: 'rundesk.theme',
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'system')
        attachSystemListener(() => useThemeStore.getState().theme)
      },
    },
  ),
)
