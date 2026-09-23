# OVERCORRECTED: nobody may put anybody else on a task, editor or not.
# Reddens: task-boundaries: "which somebody who may edit the task can do"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (userId !== actorId) await this.assertTaskWriteAccess(taskId, actorId)\n'
b = "    if (userId !== actorId) throw new ForbiddenException('Only you can follow for yourself')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-24-editors-may-not-add-followers: applied")
