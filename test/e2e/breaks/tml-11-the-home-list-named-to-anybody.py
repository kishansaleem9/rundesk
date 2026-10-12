# A TASK’S HOME LIST IS NAMED TO EVERY READER OF A LIST IT WAS ADDED TO.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "whoever may open one of its lists reads it there: Max, refused it before, reads it by id and in the team list after — its home still Mia’s list, which is not named to him"
#   or "the team list draws the task with a chip saying it lives elsewhere — the list unnamed to Max — in a group of its home list’s status, named as at home, which the team list does not have, offering no + Add Task there"
#
# The list page names a private home list to whoever reads the list the task was added to.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (homeNames && actor) {\n',
     '    if (homeNames && actor && !actor) { // BROKEN: named to anybody\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-11-the-home-list-named-to-anybody: A TASK’S HOME LIST IS NAMED TO EVERY READER OF A LIST IT WAS ADDED TO.')
