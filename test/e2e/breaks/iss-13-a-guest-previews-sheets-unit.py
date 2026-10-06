# A GUEST GRANTED THE KEY PREVIEWS A SPREADSHEET (`found-6-oct/a-guest-who-may-import-makes-a-space`).
# Reddens: unit: spreadsheet-import.service.test.ts "a guest is refused the preview and the import, 403 “Guests cannot import data into a workspace”, before anything is read or written (found-6-oct/a-guest-who-may-import-makes-a-space)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await this.access.assertMayImport(this.db, { workspaceId, actorId: importer.id })\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iss-13-a-guest-previews-sheets-unit: the spreadsheet preview does not refuse a guest')
