# THE IMPORTER’S MAPPING IS IGNORED: A PERSON IS MATCHED BY EMAIL ALONE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a Trello board comes in as a Folder named for it with one List, “Imported from Trello”, whose statuses are its columns, a done one closed; a card keeps its labels, checklists and custom fields, and its member where the importer mapped them — one not mapped is nobody’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (this.people.has(p.key)) return this.people.get(p.key) ?? null\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-7-mapping-ignored: THE IMPORTER’S MAPPING IS IGNORED: A PERSON IS MATCHED BY EMAIL ALONE.')
