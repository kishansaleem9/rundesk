# THE CALENDAR'S TASKS DRAG FOR EVERYBODY.
# RE-AIMED 6 October: a row reads its own task’s answer now (`mayEditTask`, `found-6-oct/list-page-offers-task-edits-by-list-level`).
# Reddens: list-page-levels: "the Calendar and the Gantt give a view-only reader no day to add on and no task to move — a pressed bar stays where it was and opens the task — and where the default is Full edit a day offers Add and a dragged bar moves the task’s dates"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '                          draggable={listAccess.mayEditTask(task)}\n'
b = '                          draggable\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lpl-29-calendar-drag-for-all: the calendar's tasks drag for everybody")
