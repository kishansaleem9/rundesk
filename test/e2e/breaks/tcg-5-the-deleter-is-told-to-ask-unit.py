# WHOEVER DELETED A LIST IS NOT COUNTED AMONG THOSE WHO MAY RESTORE IT: they are told to ask somebody else.
# Reddens: unit: task-create.test.ts "tells the member who deleted it to restore it from Trash"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  return isAdminRole(role) || (!!deletedById && deletedById === actorId)\n'
b = '  return isAdminRole(role)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcg-5-the-deleter-is-told-to-ask-unit: the deleter is told to ask')
