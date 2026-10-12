# A PRESS ON A TIMELINE BAR IS SAVED (`found-5-oct/timeline-press-moves-dates`): every mouseup sends the bar's
# dates, moved or not, as the timeline did — a PATCH for a press that changed nothing.
# Reddens: timeline-dates: "a press on a timeline bar that does not move it saves nothing: in UTC, Los Angeles and Karachi a task due at 17:30 and a date-only task keep both dates, and no PATCH is sent (read by SQL)"
#   or "a press whose mouse moves a pixel or two is a press: at Auto fit, a day under four pixels, a press on a bar with two pixels of travel sends nothing and the task keeps its dates (read by SQL)"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
a = '      const patch = days === 0 ? null : move(days)\n'
b = '      const patch = move(days)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-1-a-press-is-saved: a press on a bar sends its dates')
