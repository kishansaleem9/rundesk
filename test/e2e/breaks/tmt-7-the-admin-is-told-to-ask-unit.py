# A MOVE INTO A LIST IN THE TRASH ASKS NOBODY’S ROLE: a workspace admin is told to ask somebody else.
# Reddens: unit: task-move-target.test.ts "and tells a workspace admin to restore it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      throw new ListInTrashException(mayRestoreList(superAdmin ? 'super_admin' : membership?.role, target.listDeletedById, actorId))\n"
b = '      throw new ListInTrashException(mayRestoreList(null, target.listDeletedById, actorId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tmt-7-the-admin-is-told-to-ask-unit: an admin is told to ask')
