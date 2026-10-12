# THE LIST ANSWERS NO ROW ITS OWN `mayEdit` again: the page offers each row by the list’s level alone.
# Reddens: list-page-levels: "a task shared with the member at Edit, in a list they may only view, is theirs to change on the list page — its row offers a due date and a priority, its Calendar item drags and its Gantt bar moves its dates — while the task beside it, shared with nobody, offers none of them, and the list says which (mayEdit)"
#
# Re-aimed 12 October: a task added to the list from another one is answered by
# the rules of where it lives (Tasks in Multiple Lists), so the answer is chosen
# per row now; it is dropped for every row. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        ...(editable ? { mayEdit: editable(r) } : {}),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lpl-34-the-list-says-no-row-s-own-answer: tasks.service.ts: the list answers no row its own mayEdit.')
