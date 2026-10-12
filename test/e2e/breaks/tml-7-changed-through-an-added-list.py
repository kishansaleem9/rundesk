# A TASK IS CHANGED THROUGH A LIST IT WAS ADDED TO.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "it is one task: Mia renames it in her list and the team list reads the new name, one row of it (read by SQL) — and Max, who may change nothing in Mia’s list, may not change it from his"
#   or "the team list draws the task with a chip saying it lives elsewhere — the list unnamed to Max — in a group of its home list’s status, named as at home, which the team list does not have, offering no + Add Task there"
#   or "and the Board draws a column for that status, the task on it"
#
# The write rule reads the task as any read does, through the lists it was added to too.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('{ id: actorId, role: account?.role }, { atHome: true })',
     '{ id: actorId, role: account?.role }) // BROKEN: read through an added list\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-7-changed-through-an-added-list: A TASK IS CHANGED THROUGH A LIST IT WAS ADDED TO.')
