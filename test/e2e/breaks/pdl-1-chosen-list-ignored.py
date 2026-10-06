# THE CHOSEN LIST IS READ BY NOTHING AGAIN: every task without a list takes the
# oldest one.
# Re-claimed 6 October: a deleted choice is never reached either, so the trash checks redden too.
# Reddens: planner-default-list: "/task puts its task in the list chosen as the default for new tasks"
#   or "a chat message made into a task lands in that list too"
#   or "and so does an AI answer made into a task"
#   or "with the chosen list deleted, /task, a chat message made into a task and an AI answer made into one are each refused — 409, saying the Default list is in the trash and what to do — and no task is made, in it or anywhere"
#   or "and the chat page says why, in the server’s words, when its Create task is refused — no task made"
#   or "and a member whose chosen list an admin deleted is told to ask a workspace admin, or whoever deleted it, to restore it — the Trash will not let them — or to choose another; no task made"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (chosen) {\n'
b = "    if (chosen === '__never__') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-1-chosen-list-ignored: the chosen list is ignored')
