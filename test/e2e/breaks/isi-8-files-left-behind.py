# A TASK’S FILES ARE LEFT IN THE TOOL.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a task keeps its notes, dates, tags, its assignee where they are a member here, and its comments — under their author when they are a member, else under the importer with the author’s name at the head — and its files; a file that is only a link is not one"
#   or "its custom fields become fields of the List — a number, a dropdown holding every value the issues have — and every comment comes in, the ones past the first read from the issue’s own route; its attachment through Atlassian’s redirect to the file; every page of issues read"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        for (const f of files) await this.file(taskId, title, f)\n',
     '        void files\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-8-files-left-behind: A TASK’S FILES ARE LEFT IN THE TOOL.')
