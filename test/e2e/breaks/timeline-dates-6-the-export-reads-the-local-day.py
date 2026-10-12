# THE TIMELINE'S EXPORT DATES A DATE-ONLY TASK BY THE LOCAL DAY OF ITS UTC MIDNIGHT
# (`found-5-oct/timeline-press-moves-dates`), as it did: west of UTC the file says the 11th of a task the chart
# draws on the 12th.
# Re-aimed 8 October: the dates carry their time flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
# Reddens: timeline-dates: "and the timeline’s export says what it draws: in Los Angeles that date-only task runs from 2026-10-12 to 2026-10-14, three days"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
a = '            csvCell(toDateInput(task.startDate, task.startDateHasTime)),\n            csvCell(toDateInput(task.dueDate, task.dueDateHasTime)),\n'
b = "            csvCell(task.startDate ? localIsoDate(new Date(task.startDate).getTime()) : ''),\n            csvCell(task.dueDate ? localIsoDate(new Date(task.dueDate).getTime()) : ''),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("timeline-dates-6-the-export-reads-the-local-day: the export dates by the instant's local day")
