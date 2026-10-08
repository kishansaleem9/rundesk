import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cellStride, chartDayPx, drawnDays, MAX_CHART_PX } from './drawn-days'

/**
 * `found-6-oct/timeline-and-gantt-draw-a-column-per-day`: one task in year 202
 * made the workspace timeline and the list's Gantt draw an element for each of
 * 666,000 days. What they draw now is the days in view and a margin, whatever
 * the span, and the span is laid out no wider than a browser lays anything out.
 */
describe('a time chart draws the days in view, however long its span', () => {
  // Year 202 to October 2026, as the probe of 6 October measured it.
  const DAYS = 666_216

  it('draws the view and a view either side, at the start of a long span', () => {
    const { from, to } = drawnDays(0, 1200, 28, DAYS)
    assert.equal(from, 0)
    assert.ok(to * 28 >= 1200 + 1200, `drawn to ${to * 28}px, short of the view and its margin`)
    assert.ok(to < 200, `${to} days drawn for a view of 43`)
  })

  it('and at its end, as many and no more, ending at the span', () => {
    const end = DAYS * 28 - 1200
    const { from, to } = drawnDays(end, 1200, 28, DAYS)
    assert.equal(to, DAYS)
    assert.ok(from * 28 <= end - 1200, 'the margin before the view is drawn')
    assert.ok(to - from < 200, `${to - from} days drawn for a view of 43`)
  })

  it('holds its margin wherever the scroll stands, and moves only by a step', () => {
    const seen = new Set<string>()
    for (let left = 50_000; left < 60_000; left += 7) {
      const { from, to } = drawnDays(left, 1000, 56, DAYS)
      assert.ok(from * 56 <= left - 1000 && to * 56 >= left + 1000 + 1000, `at ${left}px the margin was not drawn: ${from}–${to}`)
      seen.add(`${from}-${to}`)
    }
    // 10,000 px of scrolling in 7 px moves, and the window moved by steps of 9 days (504 px): about 20 windows, not 1,400.
    assert.ok(seen.size <= 25, `${seen.size} windows for 10,000 px of scrolling`)
  })

  it('draws nothing for a chart with no days or no width a day', () => {
    assert.deepEqual(drawnDays(0, 1200, 28, 0), { from: 0, to: 0 })
    assert.deepEqual(drawnDays(0, 1200, 0, DAYS), { from: 0, to: 0 })
  })
})

describe('a span is laid out no wider than a browser lays anything out', () => {
  it('keeps a zoom’s width for a span that fits', () => {
    assert.equal(chartDayPx(56, 365), 56)
    assert.equal(chartDayPx(28, 100_000), 28)
  })

  it('narrows the days of a span that would not: year 202 at the Day zoom was 37 million px', () => {
    const px = chartDayPx(56, 666_216)
    assert.ok(px < 56)
    assert.ok(Math.abs(px * 666_216 - MAX_CHART_PX) < 1)
    // Under Firefox's last pixel (17,895,697) and Chromium's (33,554,431).
    assert.ok(MAX_CHART_PX < 17_895_697)
  })
})

describe('a header cell is never narrower than its minimum', () => {
  it('is one unit wide while a unit is wide enough', () => {
    assert.equal(cellStride(28, 24), 1)
    assert.equal(cellStride(7 * 28, 24), 1)
  })

  it('takes as many units as reach the minimum when they are drawn narrower: a fitted span of 666,000 days', () => {
    const dayPx = 1200 / 666_216
    const weeks = cellStride(7 * dayPx, 24)
    assert.ok(weeks * 7 * dayPx >= 24)
    assert.ok((weeks - 1) * 7 * dayPx < 24)
  })
})
