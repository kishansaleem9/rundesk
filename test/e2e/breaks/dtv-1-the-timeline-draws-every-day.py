# The workspace timeline draws every day of its span again, not the days in view
# (`found-6-oct/timeline-and-gantt-draw-a-column-per-day`).
#
# The window `useDrawnDays` keeps is thrown away for the whole span: every day,
# week or month from the earliest date to the latest is a header cell again. A
# task starting in year 202 makes that 666,000 days, and choosing its project
# draws them all before anything else.
#
# Measured on lane 5: the project drawn 44 s after it was chosen, 95,192
# elements, and its Day zoom, a cell a day, 123 s.
#
# Reddens: timeline-dates:
#   "the workspace timeline draws a project holding a task that starts in year 202 within a second of its being chosen, its span starting in year 202, with a few thousand elements at most — not one a day"
#   "and its Day zoom is drawn within a second, and scrolled to the span’s far end shows this October: the bar of a task starting 7 October in view, under the day “2026-10-07”"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
a = "  const drawn = useDrawnDays(scroller, dayPx, days)\n"
b = "  const drawn = { ...useDrawnDays(scroller, dayPx, days), from: 0, to: days }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtv-1-the-timeline-draws-every-day: the timeline draws its whole span again')
