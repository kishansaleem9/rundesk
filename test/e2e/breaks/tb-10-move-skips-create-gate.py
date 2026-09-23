# THE DOOR AROUND THE CREATE GATE. A member may not make a task in a view-only
# space, and moves one in instead.
# Reddens: task-boundaries: "a list in a view-only space is refused — the same gate creating a task there faces"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    await assertCanCreateInSpace(this.db, { spaceId: target.spaceId, actorId, kind: 'task' })\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-10-move-skips-create-gate: applied")
