# EVERY IMPORTED COMMENT IS FILED UNDER THE IMPORTER.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a task keeps its notes, dates, tags, its assignee where they are a member here, and its comments — under their author when they are a member, else under the importer with the author’s name at the head — and its files; a file that is only a link is not one"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const author = this.whom(c.author)\n',
     '    const author: string | null = null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-6-comments-under-the-importer: EVERY IMPORTED COMMENT IS FILED UNDER THE IMPORTER.')
