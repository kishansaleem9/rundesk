# A WRIKE FOLDER’S INNER FOLDERS AND PROJECTS ARE LEFT OUT.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a Wrike space comes in as a Space: its top folder a Folder holding a List of its own tasks and one for each folder and project inside it, a project at the top a List; each List’s statuses the workflow statuses its tasks are in; subtasks and theirs, one level here; a formula field left out"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/wrike.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      for (const d of descendants(f)) {\n',
     '      for (const d of descendants(f).slice(0, 0)) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-20-wrike-inner-folders-dropped: A WRIKE FOLDER’S INNER FOLDERS AND PROJECTS ARE LEFT OUT.')
