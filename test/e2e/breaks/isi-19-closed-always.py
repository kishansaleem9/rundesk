# TODOIST’S COMPLETED TASKS COME IN UNASKED.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "left as ClickUp’s wizard starts it, the completed tasks stay in Todoist, unasked for; and the report says Todoist’s files do not come in"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/todoist.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const closed = options.closed === 'yes' ? await this.completed(project.id) : []\n",
     '    const closed = await this.completed(project.id)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-19-closed-always: TODOIST’S COMPLETED TASKS COME IN UNASKED.')
