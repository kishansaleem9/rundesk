# NO GROUP FOR A HOME LIST’S STATUS.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "the team list draws the task with a chip saying it lives elsewhere — the list unnamed to Max — in a group of its home list’s status, named as at home, which the team list does not have, offering no + Add Task there"
#   or "and the Board draws a column for that status, the task on it"
#
# A task in a status the list does not have is drawn in no group and on no column.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('function foreignStatuses(tasks: TaskItem[], own: ListStatus[]): ListStatus[] {\n  const ownKeys',
     'function foreignStatuses(tasks: TaskItem[], own: ListStatus[]): ListStatus[] {\n  if (own) return [] // BROKEN\n  const ownKeys'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-w1-no-group-for-a-home-status: NO GROUP FOR A HOME LIST’S STATUS.')
