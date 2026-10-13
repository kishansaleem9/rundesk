# ONLY ASANA’S FIRST PAGE IS READ.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "the Asana tab says whose sign-in it is, offers its workspaces and their projects, matches its people to members by email (one who is nobody here maps to nobody), starts on sections as statuses, and reports what the run made and what Asana keeps"
#   or "its subtasks come in as subtasks, one level deep as ClickUp’s Asana import brings them — a subtask’s own subtasks are not asked for — and every page Asana names is read"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/asana.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      next = body.next_page?.uri ?? null\n',
     '      next = null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-5-asana-one-page: ONLY ASANA’S FIRST PAGE IS READ.')
