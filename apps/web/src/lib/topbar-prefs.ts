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

/**
 * §6 [07:55–08:03] — every tool that can be pinned.
 *
 * "yeh task creation ka option hai, yeh timing ka option, yeh document ka, yeh
 * Loom ka, yeh voice recordings ka, yeh whiteboards ka, aur yeh dashboard ka
 * option hai." Mirrors TOPBAR_ITEMS in the API, which validates the write.
 */
export const TOPBAR_ITEMS = [
  'notifications', 'theme', 'timer', 'ai', 'create',
  'docs', 'clips', 'recordings', 'whiteboards', 'dashboards',
] as const
export type TopbarItem = (typeof TOPBAR_ITEMS)[number]

/** The five that existed before pinning, used to migrate an old hidden-list. */
const LEGACY_ITEMS: TopbarItem[] = ['notifications', 'theme', 'timer', 'ai', 'create']

/**
 * What a member who has never opened the picker gets. Small on purpose: a bar
 * preloaded with ten icons has made the choice for them again.
 */
const DEFAULT_PINNED: TopbarItem[] = ['create', 'timer', 'theme']

const isItem = (v: unknown): v is TopbarItem =>
  typeof v === 'string' && (TOPBAR_ITEMS as readonly string[]).includes(v)

/**
 * §6 — the pinned set, migrating anyone who only has the old hidden-list.
 *
 * The two are opposites, so this cannot be a rename. `topbarHidden` said what
 * to take away and everything absent was shown; `topbarPinned` says what to
 * show and everything absent is not. Reading a member's old hidden-list as a
 * pinned one would empty their bar; ignoring it would fill it with five things
 * they had already put away. So: null means never chosen, and is derived from
 * whatever they had. An empty array means they pinned nothing, which is a
 * decision and is left alone.
 */
export function resolvePinned(
  pinned: unknown,
  hidden: unknown,
): Set<TopbarItem> {
  if (Array.isArray(pinned)) return new Set(pinned.filter(isItem))
  if (Array.isArray(hidden)) {
    const away = new Set(hidden.filter(isItem))
    return new Set(LEGACY_ITEMS.filter((item) => !away.has(item)))
  }
  return new Set(DEFAULT_PINNED)
}

/**
 * The current member's pinned set.
 *
 * Resolves to a default while the profile is in flight, so nothing flashes into
 * the bar on load and then vanishes — a flicker reads as a bug, and the bell in
 * particular is the control she asked to stop seeing.
 */
export function usePinnedTopbarItems(): Set<TopbarItem> {
  const pinned = useAuthStore((s) => s.user?.topbarPinned)
  const hidden = useAuthStore((s) => s.user?.topbarHidden)
  return resolvePinned(pinned, hidden)
}

export function useTopbarVisible(): (item: TopbarItem) => boolean {
  const pinned = usePinnedTopbarItems()
  return (item: TopbarItem) => pinned.has(item)
}

/**
 * Pin or unpin one tool. Writes through to the server and updates the
 * cached profile, so the top bar reacts on the same tick rather than after a
 * refetch.
 */
export function useSetTopbarItem() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const next = (item: TopbarItem, visible: boolean) => {
    const current = resolvePinned(user?.topbarPinned, user?.topbarHidden)
    if (visible) current.add(item)
    else current.delete(item)
    return [...current]
  }

  return useMutation({
    mutationFn: async ({ item, visible }: { item: TopbarItem; visible: boolean }) => {
      const topbarPinned = next(item, visible)
      await api('/users/me', { method: 'PATCH', body: { topbarPinned } })
      return topbarPinned
    },
    // Applied before the request, not after it. This is a checkbox: it has to
    // move when you click it. Waiting for a round trip means it sits there
    // looking broken on a slow connection, and it made the browser test flaky
    // for the same reason a person would find it unconvincing — the control did
    // not reflect the click yet.
    onMutate: ({ item, visible }) => {
      const previous = user?.topbarPinned ?? null
      if (user) setUser({ ...user, topbarPinned: next(item, visible) })
      return { previous }
    },
    onError: (_error, _vars, context) => {
      // Put it back rather than leaving the control disagreeing with the server.
      if (user && context) setUser({ ...user, topbarPinned: context.previous })
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['users', 'me'] })
    },
  })
}
