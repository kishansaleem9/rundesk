import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * §1.3 — whether the workspace sidebar is collapsed to its icon rail.
 *
 * > "Yahan par ARROW ka option aaye aur main navigation CLOSE kar sakoon… agar
 * > main is ko off karoon to mujhe bas ICONS show hon — kyunke yeh SPACE leta
 * > hai."
 *
 * Persisted, because a preference about how much room the navigation takes is
 * not one anybody wants to re-state on every page load. The key is read by the
 * inline script in index.html too, so the boot skeleton draws the rail at the
 * width this session actually uses instead of guessing.
 */
export type SidebarState = {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggle: () => void
}

export const SIDEBAR_STORAGE_KEY = 'rundesk.sidebar'

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set({ collapsed: !get().collapsed }),
    }),
    {
      name: SIDEBAR_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ collapsed: s.collapsed }),
    },
  ),
)
