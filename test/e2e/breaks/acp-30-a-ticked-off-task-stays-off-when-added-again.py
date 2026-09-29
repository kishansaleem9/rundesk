# A TASK TICKED OFF A PRIORITIES LIST, ADDED AGAIN, STAYS TICKED OFF.
#
# `found-29-sep/priority-readd-answers-a-ticked-off-row`. The duplicate add
# answers with the row that is there, done or not. Ticked off, the row has left
# the rail, so the toast says the task was added and nothing comes back. The
# owner can see nothing wrong but a missing task.
#
# ONE CHECK: the server's read of the row after it is added again.
#
# Reddens: assign-to-priorities: "a task they ticked off, added again, is back on their open list, at the end, as added by whoever put it back"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "        if (existing?.doneAt) {\n"
b = "        if (false && existing?.doneAt) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-30-a-ticked-off-task-stays-off-when-added-again: a done row is answered as it was')
