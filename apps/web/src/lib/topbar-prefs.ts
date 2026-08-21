import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useAuthStore } from '../store/auth'

/**
 * §1.5 — which top-bar controls a member has put away.
 *
 * > "hum notification yahan le ke jaa rahe hain, to humein yahan bhi rakhne ki
 * >  zaroorat nahi hai — just access; ya phir humein rakhne ki zaroorat hai to
 * >  yeh option jo hai woh humare members ke paas hona chahiye, kyunke yahan se
 * >  set down kar sakein. Lekin humare paas NAV BAR ko set down karne ka option
 * >  nahi hai; lekin ClickUp pe humein option diya jaata hai."
 *
 * Three things in one breath: take the bell out **by default** ("[Default
 * par]"), let a member decide for themselves, and — the general complaint —
 * give us any way at all to configure the nav bar. This is that mechanism; the
 * bell is simply the first thing it governs.
 *
 * Server-side on the user row rather than in localStorage, because she said
 * "members ke paas": a preference belonging to the person, not to the browser
 * they happen to be sitting at.
 */

export const TOPBAR_ITEMS = ['notifications', 'theme', 'timer', 'ai', 'create'] as const
export type TopbarItem = (typeof TOPBAR_ITEMS)[number]

/** What the top bar shows before the profile has loaded. */
const DEFAULT_HIDDEN: TopbarItem[] = ['notifications']

/**
 * Read the current member's hidden set.
 *
 * Falls back to the default while the profile is in flight, so the bell does
 * not flash into view on every page load and then disappear — the flicker would
 * read as a bug, and it is exactly the control she asked to stop seeing.
 */
export function useHiddenTopbarItems(): Set<TopbarItem> {
  const stored = useAuthStore((s) => s.user?.topbarHidden)
  const list = Array.isArray(stored) ? stored : DEFAULT_HIDDEN
  return new Set(list.filter((item): item is TopbarItem =>
    (TOPBAR_ITEMS as readonly string[]).includes(item),
  ))
}

export function useTopbarVisible(): (item: TopbarItem) => boolean {
  const hidden = useHiddenTopbarItems()
  return (item: TopbarItem) => !hidden.has(item)
}

/**
 * Show or hide one control. Writes through to the server and updates the
 * cached profile, so the top bar reacts on the same tick rather than after a
 * refetch.
 */
export function useSetTopbarItem() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const next = (item: TopbarItem, visible: boolean) => {
    const current = new Set<string>(
      Array.isArray(user?.topbarHidden) ? user.topbarHidden : DEFAULT_HIDDEN,
    )
    if (visible) current.delete(item)
    else current.add(item)
    return [...current]
  }

  return useMutation({
    mutationFn: async ({ item, visible }: { item: TopbarItem; visible: boolean }) => {
      const topbarHidden = next(item, visible)
      await api('/users/me', { method: 'PATCH', body: { topbarHidden } })
      return topbarHidden
    },
    // Applied before the request, not after it. This is a checkbox: it has to
    // move when you click it. Waiting for a round trip means it sits there
    // looking broken on a slow connection, and it made the browser test flaky
    // for the same reason a person would find it unconvincing — the control did
    // not reflect the click yet.
    onMutate: ({ item, visible }) => {
      const previous = user?.topbarHidden ?? null
      if (user) setUser({ ...user, topbarHidden: next(item, visible) })
      return { previous }
    },
    onError: (_error, _vars, context) => {
      // Put it back rather than leaving the control disagreeing with the server.
      if (user && context) setUser({ ...user, topbarHidden: context.previous })
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['users', 'me'] })
    },
  })
}
