# ONLY THE TITLE IS SEARCHED — a list or project named in the query finds nothing.
# Reddens: task-pickers-search: "and a list’s name finds the tasks in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '            ? or(ilike(tasks.title, like), ilike(lists.name, like), ilike(projects.name, like))\n'
b = '            ? ilike(tasks.title, like)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-3-title-only: applied")
