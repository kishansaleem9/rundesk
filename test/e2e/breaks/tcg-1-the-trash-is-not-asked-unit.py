# THE CREATE GATE DOES NOT ASK WHETHER THE LIST IS IN THE TRASH: a task is made in a deleted list.
# Re-aimed 6 October: the gate says what to do by the Trash’s rule.
# Reddens: unit: task-create.test.ts "refuses a task in a list in the trash, 409, saying so, to somebody who may open it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n'
b = "  if (home.inTrash && !opts.evenInTrash && actorId === '') throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcg-1-the-trash-is-not-asked-unit: the create gate does not ask the trash')
