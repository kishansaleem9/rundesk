# EVERYBODY BUT A PLATFORM ADMIN IS REFUSED AN IMPORT, AS A GUEST IS (`found-6-oct/a-guest-who-may-import-makes-a-space`).
# Reddens: unit: import-access.test.ts "a member, a manager and an admin are not refused by it, nor a platform admin who is no member"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (member?.role === 'guest') throw new ForbiddenException(GUESTS_CANNOT_IMPORT)\n"
b = "  if (member?.role !== 'super_admin') throw new ForbiddenException(GUESTS_CANNOT_IMPORT)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iac-2-everybody-is-refused-unit: the import rule refuses everybody but a platform admin')
