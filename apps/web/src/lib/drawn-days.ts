import { useEffect, useState, type RefObject } from 'react'

/**
 * THE DAYS A TIME CHART DRAWS: THOSE IN VIEW, AND A MARGIN, HOWEVER LONG ITS
 * SPAN (`found-6-oct/timeline-and-gantt-draw-a-column-per-day`).
 *
 * The workspace timeline and the list's Gantt lay their span out from the
 * earliest date they hold to the latest, and drew an element for every day of
 * it — a header cell, a grid column — and for every week and month. One task
 * starting in year 202 made that 666,000 days: the timeline drew after 17.8 s
 * with 95,834 nodes, the Gantt after a minute with 1.5 million, and its Day
 * zoom did not answer (lane 5, 6 October).
 *
 * ClickUp's Timeline has "no limit to how far you can scroll into the future or
 * past". So the span stays what it was, and so does its width — a far task is
 * still reached by scrolling to it — and only the days in the scroller's view
 * are drawn, with a view's width of margin either side, so a scroll does not
 * reach the edge of what is drawn before the next days are.
 */

/**
 * THE WIDEST A CHART IS LAID OUT. A browser lays an element out only so wide:
 * Chromium's layout units end at 33,554,431 px and Firefox's at 17,895,697 px,
 * and what lies past the end is drawn at the end. A year-202 task at the
 * timeline's Day zoom is 37 million px, so every bar of this year would have
 * been drawn in one place, out of the reach of a scroll. Under this the whole
 * span is laid out where it is in every browser; a span longer than it narrows
 * its days (`chartDayPx`).
 */
export const MAX_CHART_PX = 16_000_000

/** A zoom's px a day, narrowed so `days` of them stay under `MAX_CHART_PX`. */
export function chartDayPx(zoomPx: number, days: number): number {
  return days > 0 && days * zoomPx > MAX_CHART_PX ? MAX_CHART_PX / days : zoomPx
}

/** The day indices a chart draws: from `from`, up to and not including `to`. */
export type DrawnDays = { from: number; to: number }

/**
 * The days to draw for a scroll position: those in view, and a view's width
 * either side (at least 600 px), in steps of half that margin — so the window
 * holds the margin wherever the scroll stands, and moves, and is drawn again,
 * only when the scroll has gone a step.
 */
export function drawnDays(scrollLeft: number, viewWidth: number, dayPx: number, days: number): DrawnDays {
  if (!(dayPx > 0) || !(days > 0)) return { from: 0, to: 0 }
  const margin = Math.max(viewWidth, 600)
  const step = Math.max(1, Math.ceil(margin / 2 / dayPx))
  // The step the scroll stands in, in days: both ends of the window are counted from it, so they move together.
  const at = Math.floor(Math.max(0, scrollLeft) / dayPx / step) * step
  const from = Math.max(0, Math.floor(at - margin / dayPx))
  const to = Math.min(days, Math.ceil(at + step + (viewWidth + margin) / dayPx))
  return { from, to: Math.max(from, to) }
}

/**
 * How many of a unit (a day, a week, a month) one header cell spans so that no
 * cell is narrower than `minPx`: one, unless the units are drawn narrower than
 * that — as Auto fit draws a long span — when a cell takes as many as reach it.
 * Without it a fitted span of 666,000 days drew its 95,000 weeks in the one
 * view, every one a fiftieth of a pixel wide.
 */
export function cellStride(unitPx: number, minPx: number): number {
  return unitPx >= minPx || !(unitPx > 0) ? 1 : Math.ceil(minPx / unitPx)
}

/**
 * The days `scroller` shows of a chart of `days` days at `dayPx` a day, and the
 * margin. Read again when it scrolls or changes size, and when the span or the
 * zoom changes; a scroll that stays within the step changes nothing, so the
 * caller draws again only when the window has moved.
 *
 * Read in an effect, after the commit that attaches the scroller's ref. Until
 * then, as on a chart's first frame, the window is the one a chart scrolled to
 * its start shows in a window's width, which is where a chart opens.
 */
export function useDrawnDays(scroller: RefObject<HTMLElement | null>, dayPx: number, days: number): DrawnDays {
  const [drawn, setDrawn] = useState<DrawnDays>(() =>
    drawnDays(0, typeof window === 'undefined' ? 0 : window.innerWidth, dayPx, days),
  )
  useEffect(() => {
    const el = scroller.current
    const read = () => {
      const next = el
        ? drawnDays(el.scrollLeft, el.clientWidth, dayPx, days)
        : drawnDays(0, window.innerWidth, dayPx, days)
      setDrawn((now) => (now.from === next.from && now.to === next.to ? now : next))
    }
    read()
    if (!el) return
    el.addEventListener('scroll', read, { passive: true })
    const resized = new ResizeObserver(read)
    resized.observe(el)
    return () => {
      el.removeEventListener('scroll', read)
      resized.disconnect()
    }
  }, [scroller, dayPx, days])
  return drawn
}
