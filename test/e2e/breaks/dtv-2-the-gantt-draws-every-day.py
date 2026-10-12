# The list's Gantt draws a column for every day of its span again
# (`found-6-oct/timeline-and-gantt-draw-a-column-per-day`).
#
# The window `useDrawnDays` keeps is thrown away for the whole span, so a list
# holding a task that starts in year 202 draws 666,000 day columns, each the
# height of the chart, and its month markers, before its tab shows a bar.
#
# Measured on lane 5: drawn 72.8 s after its tab, 1,354,324 elements, and
# its Day zoom 47.7 s.
#
# Reddens: timeline-dates:
#   "the list’s Gantt of a list holding a task that starts in year 202 is drawn within a second of its tab being chosen, with a few thousand elements at most — not one a day"
#   "and its Day zoom is drawn within a second, and scrolled to the span’s far end shows this October: the bar of a task starting 7 October in view, over the day “2026-10-07”"
#
# Re-aimed 12 October: the list's Gantt tab and the timeline draw one chart now (`components/gantt-chart.tsx`,
# `resume-defects/resume-5`); the line moved there with it, so this is `dtv-1`'s edit, named here by the list's own check.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
a = "  const drawn = useDrawnDays(scroller, dayPx, days)\n"
b = "  const drawn = { ...useDrawnDays(scroller, dayPx, days), from: 0, to: days }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtv-2-the-gantt-draws-every-day: the Gantt draws a column for every day of its span again')
