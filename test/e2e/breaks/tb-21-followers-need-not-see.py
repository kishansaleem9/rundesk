# THE TARGET UNCHECKED: whoever the caller names becomes a follower, whether or
# not they can see the task — and is told about it from then on.
# Reddens: task-boundaries: "nobody can be made to follow a task they cannot see — an outsider would be told about it from then on"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertMayChangeFollowers(taskId, userId, actorId)\n    await this.assertPersonCanSeeTask(taskId, userId, 'follower')\n"
b = '    await this.assertMayChangeFollowers(taskId, userId, actorId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-21-followers-need-not-see: applied")
