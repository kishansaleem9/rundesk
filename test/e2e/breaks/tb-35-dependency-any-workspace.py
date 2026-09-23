# ADDDEPENDENCY WITHOUT ITS REFERENCE CHECK: a dependency on a task in another
# workspace — whose row the task's own read then hands back whole.
# Reddens: task-boundaries: "a dependency on a task in another workspace is NOT FOUND — the task’s own read hands back the related task whole"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertTaskReference(relatedTaskId, access.workspaceId, actorId, 'Related task not found')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-35-dependency-any-workspace: applied")
