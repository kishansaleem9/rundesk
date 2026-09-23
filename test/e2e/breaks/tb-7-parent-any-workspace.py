# THE PARENT RULE WITHOUT ITS BOUNDARY. Any readable task is accepted as a parent,
# so a member of two workspaces can hang work in one under a task in the other.
# Reddens: task-boundaries: "a parent in another workspace answers NOT FOUND, is not stored, and its details are not handed back"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (!parent || parent.workspaceId !== workspaceId) throw new NotFoundException('Parent task not found')"
b = "    if (!parent) throw new NotFoundException('Parent task not found')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-7-parent-any-workspace: applied")
