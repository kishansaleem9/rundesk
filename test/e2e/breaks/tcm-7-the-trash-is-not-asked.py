# THE CREATE GATE DOES NOT ASK WHETHER THE LIST IS IN THE TRASH, as it did not: a task is made in a deleted
# list, where nobody can find it.
# Re-aimed 6 October: the gate says what to do by the Trash’s rule, and is not asked for a list’s address.
# Reddens: task-creation-access: "a member makes no task in a list in the trash — 409, saying it is in the trash and how to bring it back, none made — and once it is restored, they do"
#   or "and what to do is said by the Trash’s own rule: the member, who did not delete it, is told to ask a workspace admin or whoever deleted it to restore it; the admin, and a member who deleted their own list, are told to restore it from Trash"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n'
b = "  if (home.inTrash && !opts.evenInTrash && actorId === '') throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcm-7-the-trash-is-not-asked: the create gate does not ask the trash')
