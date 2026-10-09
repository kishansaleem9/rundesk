# A FOLDER'S TEMPLATE TAKES ITS LISTS IN THE TABLE'S ORDER, not the folder's: two lists that share a position come
# back however Postgres holds them (`found-8-oct/folder-template-lists-in-any-order`).
# Reddens: template-center: "and a folder’s ⋯ saves it as a Folder template, with both its lists and their tasks"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      .orderBy(asc(lists.position), asc(lists.createdAt), asc(lists.id))\n',
     '      .orderBy(asc(lists.position)) // BROKEN: the table decides between equals\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("template-center-42-folder-lists-in-the-tables-order: a folder's template takes its lists in the table's order")
