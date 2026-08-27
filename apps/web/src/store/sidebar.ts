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
/**
 * §1.3 [10:13] — the surfaces whose SECOND-level panel collapses.
 *
 * Mirrors COLLAPSIBLE_PANELS on the server, which rejects anything else: this
 * ends up in a jsonb column, so the two lists disagreeing means a preference
 * that silently fails to save.
 */
export type CollapsiblePanel = 'chat' | 'docs'

export type SidebarState = {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggle: () => void
  /** Apply the server's value without writing it back. */
  hydrateCollapsed: (collapsed: boolean) => void

  /**
   * §1.3 [10:13] — "yeh DOUBLE NAVIGATION rakhi hui hai… kyunke yeh SPACE leta
   * hai." Whether each second-level panel is collapsed.
   *
   * Per surface, because collapsing the chat channel list is not a statement
   * about the docs tree. Absent means never chosen, which reads as expanded.
   */
  panels: Partial<Record<CollapsiblePanel, boolean>>
  isPanelCollapsed: (panel: CollapsiblePanel) => boolean
  togglePanel: (panel: CollapsiblePanel) => void
  hydratePanels: (panels: Partial<Record<CollapsiblePanel, boolean>>) => void
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

/** The same arrangement for the second-level panels (§1.3 [10:13]). */
let persistPanelsRemote: ((panels: Partial<Record<CollapsiblePanel, boolean>>) => void) | null = null
export function setPanelsPersister(fn: (panels: Partial<Record<CollapsiblePanel, boolean>>) => void) {
  persistPanelsRemote = fn
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

      panels: {},
      // Absent means never chosen, which reads as expanded — the same rule the
      // outer sidebar's nullable column follows.
      isPanelCollapsed: (panel) => get().panels[panel] === true,
      togglePanel: (panel) => {
        const next = { ...get().panels, [panel]: !get().panels[panel] }
        set({ panels: next })
        persistPanelsRemote?.(next)
      },
      hydratePanels: (panels) => set({ panels }),
    }),
    {
      name: SIDEBAR_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ collapsed: s.collapsed, panels: s.panels }),
    },
  ),
)
