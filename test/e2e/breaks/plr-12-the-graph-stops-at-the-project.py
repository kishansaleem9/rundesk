# THE DEPENDENCY GRAPH ASKS THE SPACE AND THE PROJECT ONLY: a blocker in a private list is drawn.
# Reddens: private-list-reach: "the member’s dependency graph names no task of the private list — the admin’s does"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          reader ? taskInReachFilter(this.db, root.workspaceId, reader.id, isManager) : undefined,\n'
b = '          reader ? containerVisibilityFilter(this.db, reader.id, isManager) : undefined,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-12-the-graph-stops-at-the-project: applied")
