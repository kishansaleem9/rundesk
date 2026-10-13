# ASANA TASKS IN NO SECTION ARE DROPPED WHEN SECTIONS ARE LISTS.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "brings an Asana project in as a Folder: its sections the statuses of one List, or Lists of their own"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/asana.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (loose.length) lists.push({ name: 'Untitled section', statuses: null, tasks: loose })\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-u7-loose-tasks-dropped: ASANA TASKS IN NO SECTION ARE DROPPED WHEN SECTIONS ARE LISTS.')
