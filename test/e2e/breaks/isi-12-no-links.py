# TASKS LINKED IN THE TOOL COME IN UNLINKED.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "with all issues in one List and epics kept apart, the story is a task of its own beside its epic, linked to it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      for (const to of t.links) this.links.push({ from: t.ref, to })\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-12-no-links: TASKS LINKED IN THE TOOL COME IN UNLINKED.')
