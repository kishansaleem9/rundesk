# The days a chart draws stay those it opened on: a scroll does not move them
# (`found-6-oct/timeline-and-gantt-draw-a-column-per-day`).
#
# The window is read when the chart is drawn and when it changes size, and no
# longer when it scrolls. Scrolled to its far end, a long span shows its bars
# over an empty header and grid.
#
# Reddens: timeline-dates:
#   "and its Day zoom is drawn within a second, and scrolled to the span’s far end shows this October: the bar of a task starting 7 October in view, under the day “2026-10-07”"
#   "and its Day zoom is drawn within a second, and scrolled to the span’s far end shows this October: the bar of a task starting 7 October in view, over the day “2026-10-07”"
import io
p = '/home/user/rundesk/apps/web/src/lib/drawn-days.ts'
a = "    el.addEventListener('scroll', read, { passive: true })\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtv-4-the-drawn-days-stay-where-the-chart-opened: a scroll no longer moves the drawn days')
