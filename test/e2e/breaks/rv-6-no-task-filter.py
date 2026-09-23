# PRIVATE TASKS LEFT OUT.
# Reddens: read-visibility: "nor a private task they neither made nor are assigned"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = '          taskVisibilityFilter(this.db, opts.actorId, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rv-6-no-task-filter: applied")
