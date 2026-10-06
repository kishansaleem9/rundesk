# A MOVE INTO A LIST IN THE TRASH TELLS EVERYBODY TO RESTORE IT: a member the Trash refuses its restore included.
# Reddens: unit: task-move-target.test.ts "refuses it, 409, telling a member who did not delete it to ask for it to be restored, and moves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      throw new ListInTrashException(mayRestoreList(superAdmin ? 'super_admin' : membership?.role, target.listDeletedById, actorId))\n"
b = '      throw new ListInTrashException(true)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tmt-6-the-member-is-told-to-restore-unit: everybody is told to restore it')
