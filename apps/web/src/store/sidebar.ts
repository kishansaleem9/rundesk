import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * §1.3 — whether the workspace sidebar is collapsed to its icon rail.
 *
 * > "Yahan par ARROW ka option aaye aur main navigation CLOSE kar sakoon… agar
 * > main is ko off karoon to mujhe bas ICONS show hon — kyunke yeh SPACE leta
 * > hai."
 *
 * Stored in two places on purpose, which is worth explaining.
 *
 * The server row is the truth: this is a preference of the person, not of the
 * browser they happen to be sitting at — the same conclusion §1.5 reached for
 * the top bar — and keeping it local meant "mujhe nahi chahiye to space le"
 * [10:24] held on one machine and was forgotten on the next.
 *
 * localStorage stays as a cache, because index.html reads this key before React
 * exists, to draw the boot skeleton's rail at the width this session actually
 * uses. Waiting for /users/me to answer that would mean the sidebar visibly
 * jumping on every cold load, which is the §2.9a complaint in miniature.
 */
export type SidebarState = {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggle: () => void
  /** Apply the server's value without writing it back. */
  hydrateCollapsed: (collapsed: boolean) => void
}

/**
 * Write-through to the member's row. Injected rather than imported so this
 * store keeps no dependency on the api client — and so a failed write is a
 * preference that did not travel, never a toggle that refuses to move.
 */
let persistRemote: ((collapsed: boolean) => void) | null = null
export function setSidebarPersister(fn: (collapsed: boolean) => void) {
  persistRemote = fn
}

export const SIDEBAR_STORAGE_KEY = 'rundesk.sidebar'

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      setCollapsed: (collapsed) => {
        set({ collapsed })
        persistRemote?.(collapsed)
      },
      toggle: () => {
        const next = !get().collapsed
        set({ collapsed: next })
        persistRemote?.(next)
      },
      // No write-back: this is the server telling us, not us telling it.
      hydrateCollapsed: (collapsed) => set({ collapsed }),
    }),
    {
      name: SIDEBAR_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ collapsed: s.collapsed }),
    },
  ),
)
