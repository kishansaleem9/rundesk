# ASANA’S SECTIONS ARE STATUSES WHATEVER THE IMPORTER CHOSE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "with sections as Lists, a project brought into an existing Space is a Folder there with a List for each section — and one for the tasks in none — each with the Space’s own statuses"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/asana.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (options.sections === 'lists') {\n",
     "    if (options.sections === 'never') {\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-9-sections-always-statuses: ASANA’S SECTIONS ARE STATUSES WHATEVER THE IMPORTER CHOSE.')
