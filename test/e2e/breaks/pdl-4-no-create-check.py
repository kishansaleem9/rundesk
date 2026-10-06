# A CHOSEN LIST IS USED WHETHER OR NOT THE PERSON MAY ADD TO IT: the task is
# refused, where it should have gone to a list they can add to.
# Re-aimed 6 October: the chosen list is asked the create gate itself, which says when it is in the trash
# (`found-5-oct/default-list-files-into-an-archived-list`).
# Re-claimed 6 October: a member's deleted choice is taken too.
# Reddens: planner-default-list: "a chosen list the person may not add to is passed over, not refused: the task lands in the oldest list they can add to"
#   or "with the chosen list deleted, /task, a chat message made into a task and an AI answer made into one are each refused — 409, saying the Default list is in the trash and what to do — and no task is made, in it or anywhere"
#   or "and the chat page says why, in the server’s words, when its Create task is refused — no task made"
#   or "and a member whose chosen list an admin deleted is told to ask a workspace admin, or whoever deleted it, to restore it — the Trash will not let them — or to choose another; no task made"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        try {\n          await this.assertCanCreateTaskIn(chosen, actorId)\n          return chosen\n'
b = '        try {\n          return chosen\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-4-no-create-check: the create rule is not asked')
