# A CALENDAR DROP SENDS THE DAY ALONE (`found-5-oct/timeline-press-moves-dates`, as the builder and the review found
# it): `yyyy-MM-dd`, so a task due at 17:30 dropped on another day is due there at midnight, its time gone.
# Reddens: timeline-dates: "the list’s Calendar and Table read a date-only day as that day in every zone, and a Calendar drop keeps a task’s time: in UTC and Los Angeles a task due the 15th with no time is drawn on the 15th and labelled so in the Table, and dropped on the 20th is due the 20th, still with no time; one due the 15th at 17:30 UTC, dropped on the 20th, is due the 20th at the same hour there (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "    await patchTaskSaying(taskId, { dueDate: withDatePart(current, format(day, 'yyyy-MM-dd')) })\n"
b = "    await patchTaskSaying(taskId, { dueDate: current === undefined ? null : format(day, 'yyyy-MM-dd') })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-14-a-calendar-drop-sends-the-day: a Calendar drop sends yyyy-MM-dd')
