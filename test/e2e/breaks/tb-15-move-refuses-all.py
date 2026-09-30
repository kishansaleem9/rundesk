# A MOVE THAT GOES NOWHERE. Every target is 'not found', which passes every
# refusal check and breaks the Move dialog outright.
# RE-ANCHORED (`found-30-sep/private-task-reads-say-403`).
# Reddens: task-boundaries: "while an ordinary move within the workspace still lands"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      : null\n    if (!target) throw new NotFoundException('Target list not found')\n"
b = "      : null\n    if (!target || target.listId) throw new NotFoundException('Target list not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tb-15-move-refuses-all: applied')
