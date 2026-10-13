# A GRANT IS READ BY ANYONE HERE WHO IMPORTS, NOT ITS IMPORTER ALONE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a way back carrying a state signed for another tool, or not by this server, is refused and keeps nothing; and a grant is its importer’s own — another admin here reads nothing through it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      .where(and(eq(importGrants.workspaceId, workspaceId), eq(importGrants.userId, userId), eq(importGrants.provider, app)))\n      .limit(1)\n',
     '      .where(and(eq(importGrants.workspaceId, workspaceId), eq(importGrants.provider, app), userId ? undefined : undefined))\n      .limit(1)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-32-anybodys-grant: A GRANT IS READ BY ANYONE HERE WHO IMPORTS, NOT ITS IMPORTER ALONE.')
