# THE LIST'S GANTT SENDS THE DAY A BAR LANDS ON, AS `yyyy-MM-dd` (`found-5-oct/timeline-press-moves-dates`), as
# `rescheduleTaskSpan` did: a task of 16 October 09:00 to 17 October 15:00, dragged a day, is saved at midnight.
# Re-aimed 8 October: the dates carry their time flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
# Reddens: timeline-dates: "the list’s Gantt moves a dragged bar by whole days and keeps its times: a task of 16 October 09:00 to 17 October 15:00, dragged a day, is 17 October 09:00 to 18 October 15:00 in UTC, Los Angeles and Karachi (read by SQL)"
#
# Re-aimed 12 October: the list's Gantt tab and the timeline draw one chart now (`components/gantt-chart.tsx`,
# `resume-defects/resume-5`); the line moved there with it, so this is `timeline-dates-2`'s edit, named here by the list's own check.
# What it sends is no longer a `yyyy-MM-dd` day but the local midnight of it — the same lost times.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
a = '  const moveBar = (days: number): DatePatch => ({\n    ...(task.startDate ? startMoved(days) : {}),\n    ...(task.dueDate ? dueMoved(days) : {}),\n  })\n'
b = '  const moveBar = (days: number): DatePatch => ({\n    startDate: daysAfter(from, days).toISOString(),\n    dueDate: daysAfter(to, days).toISOString(),\n  })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-7-the-gantt-sends-the-day: a dragged bar of the list’s Gantt saves local midnight')
