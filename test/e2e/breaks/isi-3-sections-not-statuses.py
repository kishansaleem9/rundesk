# ASANA’S SECTIONS ARE NOT THE LIST’S STATUSES.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "an Asana project comes in as a Folder named for it holding one List, “Imported from Asana”, whose statuses are its sections in their order with a closed one after them; each task in its section’s status, a completed one closed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/asana.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      lists = [{ name: 'Imported from Asana', statuses: sections.map((s) => ({ name: s.name, category: 'open' as const })), tasks: tasks.map((t) => t.task) }]\n",
     "      lists = [{ name: 'Imported from Asana', statuses: null, tasks: tasks.map((t) => t.task) }]\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-3-sections-not-statuses: ASANA’S SECTIONS ARE NOT THE LIST’S STATUSES.')
