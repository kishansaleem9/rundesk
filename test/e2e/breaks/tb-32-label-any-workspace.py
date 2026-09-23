# ADDLABEL AS IT WAS: any label id goes on, whoever's workspace it belongs to.
# Reddens: task-boundaries: "a label from another workspace cannot be put on a task — even by a member of both"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (!label || label.workspaceId !== access.workspaceId) throw new NotFoundException('Label not found')\n"
b = "    if (!label) throw new NotFoundException('Label not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-32-label-any-workspace: applied")
