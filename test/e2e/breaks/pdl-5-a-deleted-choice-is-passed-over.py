# A CHOSEN LIST IN THE TRASH IS PASSED OVER, NOT REFUSED: the task goes to the oldest list instead, somewhere the
# person did not choose, and nobody is told.
# Re-claimed 6 October: a member's deleted choice is passed over too.
# Reddens: planner-default-list: "with the chosen list deleted, /task, a chat message made into a task and an AI answer made into one are each refused — 409, saying the Default list is in the trash and what to do — and no task is made, in it or anywhere"
#   or "and the chat page says why, in the server’s words, when its Create task is refused — no task made"
#   or "and a member whose chosen list an admin deleted is told to ask a workspace admin, or whoever deleted it, to restore it — the Trash will not let them — or to choose another; no task made"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          if (err instanceof ListInTrashException) {\n'
b = "          if (err instanceof ListInTrashException && actorId === '') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-5-a-deleted-choice-is-passed-over: a chosen list in the trash is passed over')
