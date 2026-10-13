# TRELLO’S COLUMNS ARE STATUSES WHATEVER THE IMPORTER CHOSE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "with columns as Lists, a board is a Folder of a List for each column, each card in its column’s List"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/trello.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const byStatus = options.columns !== 'lists'\n",
     "    const byStatus = options.columns !== 'never'\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-15-columns-always-statuses: TRELLO’S COLUMNS ARE STATUSES WHATEVER THE IMPORTER CHOSE.')
