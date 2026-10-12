# A TIMELINE HANDLE SAVES THE DAY WITHOUT ITS TIME (`found-5-oct/timeline-press-moves-dates`): the left handle
# writes the start as the day it lands on with no time, as the handles' `startOfDay` lost 09:00.
# Re-aimed 8 October: the dates carry their time flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
# Reddens: timeline-dates: "each handle moves its own date by whole days and keeps its time: a day’s drag of the left handle starts the task at 09:00 a day later, of the right one makes it due at 17:30 a day later, the other date untouched, in UTC, Los Angeles and Karachi (read by SQL)"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
a = '    return task.startDate ? startMoved(d) : { startDate: dayAsDateOnly(daysAfter(from, d)), startDateHasTime: false }\n'
b = '    return { startDate: dayAsDateOnly(daysAfter(from, d)) }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("timeline-dates-4-a-handle-saves-midnight: the left handle drops the start's time")
