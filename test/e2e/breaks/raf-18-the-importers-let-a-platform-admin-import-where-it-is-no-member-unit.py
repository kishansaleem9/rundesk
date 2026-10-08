# THE IMPORTERS LET A PLATFORM ADMIN WHO IS NO MEMBER IMPORT AGAIN, as `raf-17`, for the unit test
# of the importers' rule (`found-6-oct/super-admin-outside-makes-what-it-cannot-change`).
# Reddens: unit: import-access.test.ts "a platform admin who is no member is refused 403 “You are not a member of this workspace” (found-6-oct/super-admin-outside-makes-what-it-cannot-change)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
a = "  if (!member) throw new ForbiddenException(READ_REFUSALS.notMember)\n"
b = "  if (!member) return // BROKEN: a platform admin who is no member imports\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-18: the importers ask no membership (unit)')
