# THE GANTT'S BARS DRAG FOR EVERYBODY.
# Reddens: list-page-levels: "the Calendar and the Gantt give a view-only reader no day to add on and no task to move — a pressed bar stays where it was and opens the task — and where the default is Full edit a day offers Add and a dragged bar moves the task’s dates"
#
# Re-aimed 12 October: the list's Gantt tab draws the timeline's chart now (`resume-defects/resume-5`), which drags
# a bar its row says may be changed (`GanttTask.mayEdit`); the list hands it every row as changeable.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        mayEdit: caps.mayEditTask(task),\n'
b = '        mayEdit: true,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("lpl-31-gantt-drag-for-all: the gantt's bars drag for everybody")
