# A TASK IS TAKEN OUT OF ITS HOME LIST.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "each refusal in words: out of its home list (403), into it again (400), into a list twice (409), out of one it is not in (404), and a subtask on its own (400)"
#
# Out of its home list is asked like any other list.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-lists.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (listId === ctx.task.listId) throw new ForbiddenException(TASK_LISTS_REFUSALS.home)\n',
     '    // BROKEN: its home list is like any other\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-4-taken-out-of-its-home: A TASK IS TAKEN OUT OF ITS HOME LIST.')
