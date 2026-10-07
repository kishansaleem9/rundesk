# AN AUTOMATION'S NOTIFICATION REACHES EVERY MEMBER AGAIN (`found-7-oct/automation-notifications-reach-every-member`).
#
# The "Send notification" action writes for each member who may open the
# task. Drop that question, and a guest with nothing shared, and a member
# outside a private list, hear of a task the API refuses them.
#
# Reddens: automation-notices:
#   "a task in a private list is told to nobody it is closed to: not a member outside the list, not a guest, not a member assigned elsewhere"
#   "a task in an open list is told once to each member who may open it, and not to a guest it is not shared with"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.service.ts'
a = "          if (!(await this.mayOpenTask(ctx.workspaceId, member.userId, ctx.taskId))) continue\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('atn-1-every-member-hears: an automation notifies every member, whoever may open the task')
