# THE MOVE WITHOUT ITS BOUNDARY. A member of two workspaces moves a task from one
# into the other — every other check passes, because they belong to both.
# Reddens: task-boundaries: "a list in another workspace is NOT FOUND — even for a caller who belongs to both"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (!target || target.workspaceId !== access.workspaceId) {\n      throw new NotFoundException('Target list not found')"
b = "    if (!target) {\n      throw new NotFoundException('Target list not found')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-9-move-any-workspace: applied")
