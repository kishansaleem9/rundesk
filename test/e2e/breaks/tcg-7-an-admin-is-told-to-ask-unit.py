# A WORKSPACE ADMIN IS NOT COUNTED AMONG THOSE WHO MAY RESTORE A LIST: they are told to ask somebody else.
# Reddens: unit: task-create.test.ts "tells a workspace admin to restore it, whoever deleted it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  return isAdminRole(role) || (!!deletedById && deletedById === actorId)\n'
b = '  return !!deletedById && deletedById === actorId\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcg-7-an-admin-is-told-to-ask-unit: an admin is told to ask')
