# SIGNING OUT OF A TOOL FORGETS NOTHING.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "signing out of Asana here forgets the grant: nothing more is read through it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      .where(and(eq(importGrants.workspaceId, workspaceId), eq(importGrants.userId, importer.id), eq(importGrants.provider, d.key)))\n    return { connected: false }\n',
     "      .where(and(eq(importGrants.workspaceId, workspaceId), eq(importGrants.userId, importer.id), eq(importGrants.provider, 'nothing')))\n    return { connected: false }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-31-sign-out-forgets-nothing: SIGNING OUT OF A TOOL FORGETS NOTHING.')
