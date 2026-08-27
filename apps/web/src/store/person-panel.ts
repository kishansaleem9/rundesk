import { create } from 'zustand'

/**
 * §G06 [05:43] — which person's panel is open, if any.
 *
 * A store rather than props because the panel is opened from everywhere a name
 * appears — a message author, an assignee chip, a member row, the avatar menu
 * — and threading `onOpenProfile` down every one of those trees is how a
 * feature ends up reachable from three of the eight places it belongs.
 *
 * It also has to survive navigation: the panel overlays whatever page you are
 * on, and closing it should put you back where you were rather than somewhere
 * a route change decided.
 */
type PersonPanelState = {
  userId: string | null
  open: (userId: string) => void
  close: () => void
}

export const usePersonPanel = create<PersonPanelState>((set) => ({
  userId: null,
  open: (userId) => set({ userId }),
  close: () => set({ userId: null }),
}))

/** Open the panel from anywhere, including non-React code. */
export function openPersonPanel(userId: string) {
  usePersonPanel.getState().open(userId)
}
