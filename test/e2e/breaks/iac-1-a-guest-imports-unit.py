# A GUEST IS NOT REFUSED AN IMPORT (`found-6-oct/a-guest-who-may-import-makes-a-space`).
# Reddens: unit: import-access.test.ts "a guest is refused 403 “Guests cannot import data into a workspace”, whatever a custom role grants them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (member?.role === 'guest') throw new ForbiddenException(GUESTS_CANNOT_IMPORT)\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iac-1-a-guest-imports-unit: the import rule refuses no guest')
