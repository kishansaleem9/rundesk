import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
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
      },
      // Cycle light → dark → system → light.
      toggle: () => {
        const order: Theme[] = ['light', 'dark', 'system']
        const next = order[(order.indexOf(get().theme) + 1) % order.length]
        applyTheme(next)
        set({ theme: next })
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
