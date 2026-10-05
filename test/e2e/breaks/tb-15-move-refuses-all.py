# A MOVE THAT GOES NOWHERE. Every target is 'not found', which passes every
# refusal check and breaks the Move dialog outright.
# Reddens: task-boundaries: "while an ordinary move within the workspace still lands"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (!target || target.workspaceId !== access.workspaceId) {\n      throw new NotFoundException('Target list not found')"
b = "    if (true) {\n      throw new NotFoundException('Target list not found')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-15-move-refuses-all: applied")
