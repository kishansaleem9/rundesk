# A WRIKE LIST HAS EVERY STATUS OF EVERY WORKFLOW, NOT THOSE ITS TASKS USE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a Wrike space comes in as a Space: its top folder a Folder holding a List of its own tasks and one for each folder and project inside it, a project at the top a List; each List’s statuses the workflow statuses its tasks are in; subtasks and theirs, one level here; a formula field left out"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/wrike.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const used = new Map<string, { name: string; group: string; order: number }>()\n',
     '    const used = new Map<string, { name: string; group: string; order: number }>([...ctx.statusOf.values()].map((s) => [s.name.toLowerCase(), s]))\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-21-every-workflow-status: A WRIKE LIST HAS EVERY STATUS OF EVERY WORKFLOW, NOT THOSE ITS TASKS USE.')
