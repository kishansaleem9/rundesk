# A DRAGGED BAR GIVES A TASK WITH ONLY A DUE DATE A START (`found-5-oct/timeline-press-moves-dates`): the drag
# sends a start whatever the task had, the bar's own first day moved, as the timeline did.
# Re-aimed 8 October: the dates carry their time flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
# Reddens: timeline-dates: "a dragged bar moves each date it has by whole days and keeps its time: in UTC, Los Angeles and Karachi a day’s drag moves 09:00 and 17:30 to the next day at 09:00 and 17:30, a date-only task to the next days still date-only, and a task with only a due date gains no start (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx'
a = '    ...(task.startDate ? startMoved(days) : {}),\n'
b = '    ...(task.startDate ? startMoved(days) : { startDate: shiftByDays(task.dueDate, days, task.dueDateHasTime) }),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-3-a-due-only-task-gains-a-start: a due-only task is given a start by a drag')
