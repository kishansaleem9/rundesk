# A ROW ADDED FROM ANOTHER LIST SAYS NOTHING OF ITS HOME.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "the team list draws the task with a chip saying it lives elsewhere — the list unnamed to Max — in a group of its home list’s status, named as at home, which the team list does not have, offering no + Add Task there"
#
# The list row draws no home chip.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          {task.addedFrom && (\n',
     '          {task.addedFrom && !task.addedFrom && (\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-w5-no-home-chip: A ROW ADDED FROM ANOTHER LIST SAYS NOTHING OF ITS HOME.')
