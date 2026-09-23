# THE REMOVE ROUTE AS IT WAS: any member takes anybody off any task they reach.
# Reddens: task-boundaries: "and taking somebody else off needs the same edit access"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    await this.assertMayChangeFollowers(taskId, userId, actorId)\n    await this.db.delete(taskWatchers)'
b = '    await this.db.delete(taskWatchers)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-26-unfollow-anyone: applied")
