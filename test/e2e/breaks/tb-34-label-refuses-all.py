# A LABEL RULE THAT REFUSES EVERY LABEL.
# Reddens: task-boundaries: "while the workspace’s own label goes on"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (!label || label.workspaceId !== access.workspaceId) throw new NotFoundException('Label not found')\n"
b = "    throw new NotFoundException('Label not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-34-label-refuses-all: applied")
