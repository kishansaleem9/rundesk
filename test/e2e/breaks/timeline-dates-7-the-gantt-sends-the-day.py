# THE LIST'S GANTT SENDS THE DAY A BAR LANDS ON, AS `yyyy-MM-dd` (`found-5-oct/timeline-press-moves-dates`), as
# `rescheduleTaskSpan` did: a task of 16 October 09:00 to 17 October 15:00, dragged a day, is saved at midnight.
# Reddens: timeline-dates: "the list’s Gantt moves a dragged bar by whole days and keeps its times: a task of 16 October 09:00 to 17 October 15:00, dragged a day, is 17 October 09:00 to 18 October 15:00 in UTC, Los Angeles and Karachi (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '    const start = shiftByDays(task.startDate, deltaDays)\n    const due = shiftByDays(task.dueDate, deltaDays)\n'
b = "    const start = task.startDate ? format(addDays(new Date(task.startDate), deltaDays), 'yyyy-MM-dd') : null\n    const due = task.dueDate ? format(addDays(new Date(task.dueDate), deltaDays), 'yyyy-MM-dd') : null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-7-the-gantt-sends-the-day: the Gantt sends yyyy-MM-dd')
