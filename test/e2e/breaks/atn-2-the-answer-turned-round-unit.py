# AN AUTOMATION WRITES TO THOSE WHO MAY NOT OPEN THE TASK, READ FROM ITS UNIT TEST (`found-7-oct/automation-notifications-reach-every-member`).
#
# The action asks of each member whether they may open the task, and writes
# for those who may. Turn the answer round, and it writes for the others.
#
# Reddens: unit: automations.service.test.ts "writes a notification only for the members who may open the task, and never for the one who made the change"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.service.ts'
a = "          if (!(await this.mayOpenTask(ctx.workspaceId, member.userId, ctx.taskId))) continue\n"
b = "          if (await this.mayOpenTask(ctx.workspaceId, member.userId, ctx.taskId)) continue\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('atn-2-the-answer-turned-round-unit: the action writes for the members who may not open the task')
