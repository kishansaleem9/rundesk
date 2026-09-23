# STOPPING FOLLOWING TREATED AS AN EDIT: a reader who followed a task can never
# stop.
# Reddens: task-boundaries: "while stopping following it yourself needs only to see it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    await this.assertMayChangeFollowers(taskId, userId, actorId)\n    await this.db.delete(taskWatchers)'
b = '    await this.assertTaskWriteAccess(taskId, actorId!)\n    await this.db.delete(taskWatchers)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-25-unfollow-needs-write: applied")
