# A NOTION EXPORT IN PARTS IS NOT READ INSIDE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "reads a Notion export: pages nested as Notion nests them, databases every row of their _all file, a row’s page its description"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/notion-export.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (inner.length && !own.length) {\n',
     '  if (inner.length && !own.length && inner.length > 99) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-u6-parts-unread: A NOTION EXPORT IN PARTS IS NOT READ INSIDE.')
