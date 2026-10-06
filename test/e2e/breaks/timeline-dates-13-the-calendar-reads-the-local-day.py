# THE LIST'S CALENDAR DRAWS A DATE-ONLY TASK ON THE LOCAL DAY OF ITS UTC MIDNIGHT (`found-5-oct/timeline-press-moves-dates`,
# as the review found it): west of UTC, a task due the 15th with no time is drawn on the 14th.
# Reddens: timeline-dates: "the list’s Calendar and Table read a date-only day as that day in every zone, and a Calendar drop keeps a task’s time: in UTC and Los Angeles a task due the 15th with no time is drawn on the 15th and labelled so in the Table, and dropped on the 20th is due the 20th, still with no time; one due the 15th at 17:30 UTC, dropped on the 20th, is due the 20th at the same hour there (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "      const key = task.dueDate ? toDateInput(task.dueDate) : 'No due date'\n"
b = "      const key = task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : 'No due date'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("timeline-dates-13-the-calendar-reads-the-local-day: the Calendar keys a day by the instant's local day")
