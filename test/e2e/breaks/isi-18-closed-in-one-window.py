# TODOIST’S COMPLETED TASKS ARE ASKED FOR ALL AT ONCE, PAST WHAT IT ANSWERS.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a Todoist project is a Folder of a List for its loose tasks and one for each section; tasks keep their subtasks, priority (p1 urgent), labels, due time, when they were made, their assignee and comments — and the completed ones come in closed when asked, read a quarter at a time as Todoist answers them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/todoist.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const since = until - QUARTER_MS\n',
     '      const since = made - QUARTER_MS\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-18-closed-in-one-window: TODOIST’S COMPLETED TASKS ARE ASKED FOR ALL AT ONCE, PAST WHAT IT ANSWERS.')
