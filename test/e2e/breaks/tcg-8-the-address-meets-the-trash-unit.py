# THE TRASH IS ASKED OF A CALLER ASKING WHAT THE PERSON MAY DO WITH THE LIST ITSELF: its address is refused.
# Reddens: unit: task-create.test.ts "asks nothing of the trash of a caller asking what the person may do with the list itself (its address): evenInTrash"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n'
b = '  if (home.inTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcg-8-the-address-meets-the-trash-unit: the trash is asked of the address too')
