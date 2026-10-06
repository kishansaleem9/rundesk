# THE LIST'S GANTT DRAWS A DATE-ONLY TASK ON THE LOCAL DAY OF ITS UTC MIDNIGHT
# (`found-5-oct/timeline-press-moves-dates`), as `GanttView` and its bars did: in Los Angeles 19 to 21 October
# reads "Oct 18 – Oct 20" and is drawn two days after a task of the 16th, not three.
# Reddens: timeline-dates: "the list’s Gantt draws a date-only task on its own days in every zone, and a day’s drag moves it a day: 19 to 21 October reads “Oct 19 – Oct 21” and is drawn three days after the task of the 16th in Los Angeles and Karachi as in UTC, and moves to the 20th to the 22nd, still date-only (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    # Where the bar is laid out.
    ('        const s = shownDay(task.startDate)\n        const d = shownDay(task.dueDate)\n',
     '        const s = task.startDate ? startOfDay(new Date(task.startDate)) : null\n        const d = task.dueDate ? startOfDay(new Date(task.dueDate)) : null\n'),
    # And what its title says.
    ('  const start = shownDay(task.startDate) ?? shownDay(task.dueDate)\n  const end = shownDay(task.dueDate) ?? shownDay(task.startDate)\n',
     '  const start = task.startDate ? startOfDay(new Date(task.startDate)) : task.dueDate ? startOfDay(new Date(task.dueDate)) : null\n  const end = task.dueDate ? startOfDay(new Date(task.dueDate)) : task.startDate ? startOfDay(new Date(task.startDate)) : null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('timeline-dates-8-the-gantt-draws-the-local-day: the Gantt plots the local day of each instant')
