# THE WATCHER ROUTE AS IT WAS: no guard on the route and no check in the service.
# An account sharing no workspace with the task follows it by id and is answered
# with the whole task. Every layer comes off, because each alone stops it.
# Reddens: task-boundaries: "an account that shares no workspace with a task cannot follow it by id — nor is it handed the task in the answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
a = "  @Post(':taskId/watchers')\n  @UseGuards(ResourceMemberGuard)\n"
b = "  @Post(':taskId/watchers')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertMayChangeFollowers(taskId, userId, actorId)\n    await this.assertPersonCanSeeTask(taskId, userId, 'follower')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-19-watchers-open-to-anyone: applied")
