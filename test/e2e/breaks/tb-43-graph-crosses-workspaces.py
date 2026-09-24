# THE GRAPH AS IT WAS: every node the edges reach, from any workspace.
# Reddens: task-boundaries: "and the dependency graph stops at the workspace’s edge"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          inArray(tasks.id, nodeIds),\n          eq(spaces.workspaceId, root.workspaceId),\n'
b = '          inArray(tasks.id, nodeIds),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-43-graph-crosses-workspaces: applied")
