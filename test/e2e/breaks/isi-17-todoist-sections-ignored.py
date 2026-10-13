# A TODOIST PROJECT’S SECTIONS ARE NOT ITS LISTS: EVERY TASK IN ONE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a Todoist project is a Folder of a List for its loose tasks and one for each section; tasks keep their subtasks, priority (p1 urgent), labels, due time, when they were made, their assignee and comments — and the completed ones come in closed when asked, read a quarter at a time as Todoist answers them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/todoist.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const loose = top.filter((t) => !t.section_id || !sections.some((s) => s.id === t.section_id))\n',
     '    const loose = top\n    sections.length = 0\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-17-todoist-sections-ignored: A TODOIST PROJECT’S SECTIONS ARE NOT ITS LISTS: EVERY TASK IN ONE.')
