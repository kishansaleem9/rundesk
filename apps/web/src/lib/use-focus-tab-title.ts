import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { useTranslation } from './i18n'

/**
 * §V2-02f — the running time block's countdown.
 *
 * WHAT THE FRAMES ACTUALLY DRAW, stated exactly, because the audit note for
 * this row says "the BROWSER TAB / header" and those are two different places:
 * at `15:20`, `15:35` and `15:50` the countdown is a pill in the APP HEADER,
 * immediately right of the workspace switcher — a moon glyph and
 * **"Work on dbgdh 2h 56m left"** — while the browser tab beside it reads
 * "vjgkgkg | #86eyjd2jb". By `16:00` the pill says **"2h 55m left"**: one
 * block, ten minutes later, counting down. Frame `16:05` is the LIST page and
 * the pill is still there, so it belongs to the app and not to the planner.
 *
 * Rundesk puts it in the BROWSER TAB, which is the surface this row covers and
 * the one that was empty: the header pill is `app-topbar.tsx` and a separate
 * row. The two are the same fact — how long is left in the block you are in —
 * and this hook is where that fact is computed, so a pill can read it later
 * without a second countdown drifting against this one.
 *
 * `grep -rn "document.title" apps/web/src` returned NOTHING before this file.
 * `index.html` ships one static string, so every tab of this product said
 * "Rundesk — modern work, run on Aura" whatever was happening in it — the same
 * words while a block ran, while it ended, and on a page with no block at all.
 *
 * A TAB TITLE IS GLOBAL MUTABLE STATE, and the two ways it goes wrong are both
 * quiet:
 *
 *   1. It never updates. Set once from whatever the first render happened to
 *      know, it becomes a screenshot of a moment — a countdown frozen at
 *      "2h 55m left" is worse than no countdown, because it is read as live.
 *      So the remaining time is recomputed from `Date.now()` on every tick and
 *      never decremented from a stored copy.
 *
 *   2. It never resets. A title written and never cleared outlives the thing it
 *      described: the block ends, or you leave the app, and a stale countdown
 *      sits in the tab strip forever. So there is exactly one owner of the
 *      title (this hook), it restores `BASE_TITLE` the moment nothing is
 *      running, and it restores it again when the shell unmounts.
 *
 * Both are asserted in `test/e2e/tab-title-countdown.mjs`.
 */

/**
 * The title the document shipped with, captured at MODULE LOAD — before any
 * render, so it cannot be a countdown this hook itself wrote.
 *
 * Captured at mount instead, a remount while a countdown was on screen would
 * adopt "Work on x · 2m 1s left" as the thing to restore, and the tab would
 * never find its way back.
 */
const BASE_TITLE = typeof document === 'undefined' ? '' : document.title

const DAY_MS = 86_400_000

/** How often the server is re-asked; the countdown itself ticks every second. */
const REFRESH_MS = 30_000

type FocusBlock = {
  id: string
  taskId: string | null
  label: string | null
  startsAt: string
  endsAt: string
  isAllDay: boolean
}

type FocusSettings = { blockPrefix?: string }

/**
 * `2h 55m` above an hour, `2m 3s` below it — the two shapes the frames show.
 *
 * Seconds only appear in the last hour on purpose: a tab title that rewrites
 * every second for eight hours is noise, and "2h 55m 04s" is unreadable at tab
 * width. Inside the hour the seconds are the point.
 */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`
}

/**
 * The block you are inside right now.
 *
 * All-day blocks are excluded rather than counted down: "23h 41m left" on a
 * whole-day marker is a number that is true and means nothing, and it would
 * hold the tab hostage all day. Of the timed blocks that overlap now, the one
 * ending soonest wins — that is the commitment you are actually in.
 */
export function pickRunningBlock(blocks: FocusBlock[], now: number): FocusBlock | null {
  let best: FocusBlock | null = null
  let bestEnd = Infinity
  for (const block of blocks) {
    if (block.isAllDay) continue
    if (!(block.label ?? '').trim()) continue
    const start = new Date(block.startsAt).getTime()
    const end = new Date(block.endsAt).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (start > now || end <= now) continue
    if (end < bestEnd) {
      best = block
      bestEnd = end
    }
  }
  return best
}

/**
 * How the block calls itself.
 *
 * The prefix is applied here, at render, exactly as the planner grid applies it
 * (`workspace-planner-page.tsx`, `const prefix = …`): a task-backed block
 * stores no title, so "Work on" + the task's current name is composed on the
 * way out. A typed block ("lunch") carries its own words and takes no prefix.
 */
export function focusBlockLabel(block: FocusBlock, prefix: string): string {
  const label = (block.label ?? '').trim()
  return block.taskId ? `${prefix} ${label}`.trim() : label
}

function startOfDayIso(at = new Date()): string {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Own the tab title while a block is running, and hand it back afterwards.
 *
 * Mounted once, in the `/app` shell (`routes/app.tsx`) — the smallest place
 * that is on screen for every workspace page and gone the moment you leave the
 * app. Mounting it per page would restart the countdown on every navigation and
 * leave the title behind on whichever page forgot to mount it.
 */
export function useFocusTabTitle(workspaceId: string | null) {
  const { t } = useTranslation()

  // Only changes at midnight, so this re-renders roughly never.
  const [dayStart, setDayStart] = useState(() => startOfDayIso())

  const { data: settings } = useQuery({
    // The same key the planner page uses, so the two share one fetch.
    queryKey: ['planner-settings', workspaceId],
    queryFn: () => api<FocusSettings>(`/planner/${workspaceId}/settings`),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  })

  /*
   * Yesterday through tomorrow, not "today": `listBlocks` filters on
   * `startsAt`, so a block that began at 23:00 and is still running at 00:30
   * is invisible to a window that starts at midnight — and that block is
   * precisely the one whose countdown matters.
   */
  const range = useMemo(() => {
    const anchor = new Date(dayStart).getTime()
    return {
      from: new Date(anchor - DAY_MS).toISOString(),
      to: new Date(anchor + 2 * DAY_MS).toISOString(),
    }
  }, [dayStart])

  const { data: blocks } = useQuery({
    queryKey: ['focus-blocks', workspaceId, range.from],
    queryFn: () =>
      api<FocusBlock[]>(
        `/planner/${workspaceId}/blocks?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
    enabled: !!workspaceId,
    // A block dropped on the grid in another tab should reach this one.
    refetchInterval: REFRESH_MS,
  })

  /*
   * The ticker is installed once and reads through this ref. Rebuilding the
   * interval on every data change would be the same bug in slower motion: the
   * closure would hold whichever blocks it was created with, and a title set
   * from that copy stops being true the moment the data moves.
   */
  const latest = useRef({ blocks: [] as FocusBlock[], prefix: '', t })
  latest.current = {
    blocks: blocks ?? [],
    prefix: settings?.blockPrefix?.trim() || t('planner.workOn'),
    t,
  }

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!workspaceId) {
      document.title = BASE_TITLE
      return
    }

    // What we last wrote. Only used to avoid pointless writes — every value is
    // computed fresh from the clock, never from this.
    let written: string | null = null

    const paint = () => {
      const now = Date.now()

      // Rolled past midnight while the tab stayed open: widen the window.
      const today = startOfDayIso(new Date(now))
      setDayStart((prev) => (prev === today ? prev : today))

      const { blocks: current, prefix, t: translate } = latest.current
      const running = pickRunningBlock(current, now)
      const next = running
        ? translate('tabTitle.focusCountdown', {
            label: focusBlockLabel(running, prefix),
            remaining: formatRemaining(new Date(running.endsAt).getTime() - now),
          })
        : BASE_TITLE
      if (next !== written) {
        document.title = next
        written = next
      }
    }

    paint()
    const id = window.setInterval(paint, 1000)
    return () => {
      window.clearInterval(id)
      // Leaving the app hands the title back. Without this line a countdown
      // written here would still be in the tab strip on the login page.
      document.title = BASE_TITLE
    }
  }, [workspaceId])
}

/** For tests and for anything that needs to know what "no countdown" reads as. */
export const FOCUS_TAB_BASE_TITLE = BASE_TITLE
