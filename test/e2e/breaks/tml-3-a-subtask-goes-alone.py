# A SUBTASK IS ADDED TO A LIST ON ITS OWN.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "each refusal in words: out of its home list (403), into it again (400), into a list twice (409), out of one it is not in (404), and a subtask on its own (400)"
#
# A subtask is put in another list without its parent.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-lists.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (ctx.task.parentTaskId) return TASK_LISTS_REFUSALS.subtask\n',
     '    // BROKEN: a subtask goes alone\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-3-a-subtask-goes-alone: A SUBTASK IS ADDED TO A LIST ON ITS OWN.')
