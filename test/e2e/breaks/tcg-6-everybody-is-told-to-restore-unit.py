# EVERYBODY IS TOLD TO RESTORE A LIST IN THE TRASH, as they were: a member the Trash refuses its restore included.
# Reddens: unit: task-create.test.ts "tells a member who did not delete it to ask an admin, or whoever did, to restore it — the Trash refuses them its restore"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n'
b = '  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(true)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcg-6-everybody-is-told-to-restore-unit: everybody is told to restore it')
