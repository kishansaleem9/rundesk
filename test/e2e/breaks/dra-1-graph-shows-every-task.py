# THE GRAPH WITH NO READER, as it was: every task the walk reaches, a refused space's included.
# Re-anchored when the task reads took the list's own privacy with the
# container rule (`taskInReachFilter`; `found-24-sep/private-lists-skipped-by-task-reads`);
# the edit is the same: the rule it names is taken out.
# Reddens: dependency-read-access: "a task’s dependency graph shows the member no task they may not open, by title or id, nor one reached only through such a task — while it shows the open blocker, and the admin’s shows them all"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          reader ? taskInReachFilter(this.db, root.workspaceId, reader.id, isManager) : undefined,\n          reader ? taskVisibilityFilter(this.db, reader.id, isManager) : undefined,\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dra-1-graph-shows-every-task: applied")
