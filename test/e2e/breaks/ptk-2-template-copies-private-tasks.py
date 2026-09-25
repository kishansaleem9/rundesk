# A SAVED TEMPLATE COPIES EVERY TASK, AS IT DID: the designer’s template holds the private task.
# Reddens: project-template-key: "the designer’s template holds the task they read and not the private one — the manager’s, who reads it, holds both — and a project the designer cannot open is saved by nobody’s key (404, none made)"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        .where(and(eq(tasks.listId, list.id), eq(tasks.isArchived, false), taskVisibilityFilter(this.db, actor.id, isManager)))\n'
b = '        .where(and(eq(tasks.listId, list.id), eq(tasks.isArchived, false)))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ptk-2-template-copies-private-tasks: tasks copied unfiltered')
