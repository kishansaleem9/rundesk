# EVERY LIST IS READ AS IN THE TRASH: no task is made anywhere.
# Re-aimed 6 October: the gate says what to do by the Trash’s rule.
# Reddens: unit: task-create.test.ts "lets a task into the same list when it is not in the trash"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n'
b = '  if ((home.inTrash || !home.inTrash) && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcg-3-every-list-in-the-trash-unit: every list is in the trash')
