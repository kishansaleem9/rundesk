# A DRAGGED TIMELINE BAR SAVES MIDNIGHT (`found-5-oct/timeline-press-moves-dates`): each date moves to the
# local midnight of the day it lands on, as the timeline's `startOfDay` did, and both are sent whatever the
# task had — 09:00 and 17:30 are lost, a date-only day gains a local offset, a due-only task a start.
# Re-aimed 8 October: the dates carry their time flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
# Reddens: timeline-dates: "a dragged bar moves each date it has by whole days and keeps its time: in UTC, Los Angeles and Karachi a day’s drag moves 09:00 and 17:30 to the next day at 09:00 and 17:30, a date-only task to the next days still date-only, and a task with only a due date gains no start (read by SQL)"
#   or "a person whose own share on a task lets them change it is offered its drag on the timeline, whatever its list allows them: a member given a task at Edit in a list they may only view, and a guest given one at Edit, each find both handles, and a day’s drag moves the task a day (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx'
a = '  const moveBar = (days: number): DatePatch => ({\n    ...(task.startDate ? startMoved(days) : {}),\n    ...(task.dueDate ? dueMoved(days) : {}),\n  })\n'
b = '  const moveBar = (days: number): DatePatch => ({\n    startDate: daysAfter(from, days).toISOString(),\n    dueDate: daysAfter(to, days).toISOString(),\n  })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-2-a-drag-saves-midnight: a dragged bar saves local midnight')
