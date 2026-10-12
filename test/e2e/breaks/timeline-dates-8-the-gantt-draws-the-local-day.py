# THE LIST'S GANTT DRAWS A DATE-ONLY TASK ON THE LOCAL DAY OF ITS UTC MIDNIGHT
# (`found-5-oct/timeline-press-moves-dates`), as `GanttView` and its bars did: in Los Angeles 19 to 21 October
# reads "Oct 18 – Oct 20" and is drawn two days after a task of the 16th, not three.
# Re-aimed 8 October: the dates carry their time flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
# Reddens: timeline-dates: "the list’s Gantt draws a date-only task on its own days in every zone, and a day’s drag moves it a day: 19 to 21 October reads “Oct 19 – Oct 21” and is drawn three days after the task of the 16th in Los Angeles and Karachi as in UTC, and moves to the 20th to the 22nd, still date-only (read by SQL)"
#
# Re-aimed 12 October: the list's Gantt tab and the timeline draw one chart now (`components/gantt-chart.tsx`,
# `resume-defects/resume-5`); the line moved there with it, so this is `timeline-dates-5`'s edit, named here by the list's own check.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
a = '  const from = shownDay(task.startDate, task.startDateHasTime) ?? shownDay(task.dueDate, task.dueDateHasTime)!\n  const to = shownDay(task.dueDate, task.dueDateHasTime) ?? shownDay(task.startDate, task.startDateHasTime)!\n'
b = '  const from = new Date(startOfDay(new Date(task.startDate ?? task.dueDate!).getTime()))\n  const to = new Date(startOfDay(new Date(task.dueDate ?? task.startDate!).getTime()))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-8-the-gantt-draws-the-local-day: the list’s Gantt plots the local day of each instant')
