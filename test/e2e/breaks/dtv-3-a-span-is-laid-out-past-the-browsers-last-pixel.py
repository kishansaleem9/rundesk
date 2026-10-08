# A chart's span is laid out at its zoom's width however long it is
# (`found-6-oct/timeline-and-gantt-draw-a-column-per-day`).
#
# `chartDayPx` keeps the zoom's px a day for every span. At the timeline's Day
# zoom, 56 px, a span from year 202 is 37 million px, past the last pixel
# Chromium lays out (33,554,431): what lies past it is drawn at it, so this
# October's bar does not stand under its own day, and the far end is not where
# the days say.
#
# Reddens: timeline-dates:
#   "and its Day zoom is drawn within a second, and scrolled to the span’s far end shows this October: the bar of a task starting 7 October in view, under the day “2026-10-07”"
import io
p = '/home/user/rundesk/apps/web/src/lib/drawn-days.ts'
a = "  return days > 0 && days * zoomPx > MAX_CHART_PX ? MAX_CHART_PX / days : zoomPx\n"
b = "  return zoomPx\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtv-3-a-span-is-laid-out-past-the-browsers-last-pixel: a span keeps its zoom’s width however long')
