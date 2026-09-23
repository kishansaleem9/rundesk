# A DEPENDENCY RULE THAT REFUSES EVERY TASK.
# Reddens: task-boundaries: "while one on a task in the same workspace is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertTaskReference(relatedTaskId, access.workspaceId, actorId, 'Related task not found')\n"
b = "    throw new NotFoundException('Related task not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-37-dependency-refuses-all: applied")
