# A JIRA STORY KEPT APART FROM ITS EPIC IS NOT LINKED TO IT.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "brings Jira’s epics in as tasks with their issues as subtasks, or as tasks of their own linked; each issue type its own List, or one"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/jira.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        if (parent && linked) t.links.push(parent.key)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-u8-epics-unlinked: A JIRA STORY KEPT APART FROM ITS EPIC IS NOT LINKED TO IT.')
