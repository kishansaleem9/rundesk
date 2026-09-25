# THE CALENDAR'S TASKS DRAG FOR EVERYBODY.
# Reddens: list-page-levels: "the Calendar and the Gantt give a view-only reader no day to add on and no task to move — a pressed bar stays where it was and opens the task — and where the default is Full edit a day offers Add and a dragged bar moves the task’s dates"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                          draggable={listAccess.edit}\n'
b = '                          draggable\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("lpl-29-calendar-drag-for-all: the calendar's tasks drag for everybody")
