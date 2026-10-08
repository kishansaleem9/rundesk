# THE IMPORTERS LET A PLATFORM ADMIN WHO IS NO MEMBER IMPORT AGAIN
# (`found-6-oct/super-admin-outside-makes-what-it-cannot-change`): the create gate refuses them
# a task there, and an import makes the project and its tasks anyway.
# Reddens: refused-as-forbidden: "the platform’s admin, no member of a workspace, makes no task there, imports nothing and changes none, each refused 403 “You are not a member of this workspace” with nothing written (SQL) — as before, it may read there"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
a = "  if (!member) throw new ForbiddenException(READ_REFUSALS.notMember)\n"
b = "  if (!member) return // BROKEN: a platform admin who is no member imports\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-17: the importers ask no membership')
