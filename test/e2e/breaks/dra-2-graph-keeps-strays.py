# THE GRAPH WITHOUT ITS PRUNING: a task reached only through a hidden one stands alone and tells of the link.
# Reddens: dependency-read-access: "a task’s dependency graph shows the member no task they may not open, by title or id, nor one reached only through such a task — while it shows the open blocker, and the admin’s shows them all"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    const rows = found.filter((r) => reach.has(r.id))\n'
b = '    const rows = found\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dra-2-graph-keeps-strays: applied")
