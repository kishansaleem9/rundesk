# ONLY THE FIRST PAGE OF A MONDAY BOARD’S ITEMS IS READ.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a Monday board is a List named for it, in a new Space; with its groups as the statuses, a Done group closes; its people column assigns, its date column is the due date, its other columns fields — the status column one of them — a formula left out; subitems are subtasks and updates comments; every page of items read"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/monday.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    for (let page = 0; cursor && page < 500; page++) {\n',
     '    for (let page = 0; cursor && page < 0; page++) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-24-monday-one-page: ONLY THE FIRST PAGE OF A MONDAY BOARD’S ITEMS IS READ.')
