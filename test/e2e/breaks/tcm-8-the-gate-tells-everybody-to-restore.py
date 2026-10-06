# THE CREATE GATE TELLS EVERYBODY TO RESTORE A LIST IN THE TRASH, as it did: a member whose list an admin deleted
# is sent to a Trash that will not let them restore it.
# Reddens: task-creation-access: "and what to do is said by the Trash’s own rule: the member, who did not delete it, is told to ask a workspace admin or whoever deleted it to restore it; the admin, and a member who deleted their own list, are told to restore it from Trash"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n'
b = '  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(true)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcm-8-the-gate-tells-everybody-to-restore: everybody is told to restore it')
