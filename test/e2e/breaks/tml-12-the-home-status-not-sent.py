# A TASK ADDED TO A LIST CARRIES NO HOME STATUS.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "the team list draws the task with a chip saying it lives elsewhere — the list unnamed to Max — in a group of its home list’s status, named as at home, which the team list does not have, offering no + Add Task there"
#
# The page names a home list’s status by its key alone.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('homeStatus: homeStatusOf(r) }',
     'homeStatus: homeStatusOf(r) && null }'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-12-the-home-status-not-sent: A TASK ADDED TO A LIST CARRIES NO HOME STATUS.')
