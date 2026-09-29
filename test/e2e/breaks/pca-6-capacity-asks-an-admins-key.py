# A MEMBER'S CAPACITY ASKS THE CALENDAR'S KEY, AN ADMIN'S: the manager, and the member granted members.profile.manage, set nobody's hours.
# Re-aimed 29 September: somebody else's capacity asks the key inline, since a member sets their own (`own-capacity-not-self-service`).
# Reddens: people-calendar-access: "a manager sets a member’s weekly capacity and whom they report to, and so does the admin"
#   or "a member granted members.profile.manage sets a colleague’s capacity to 24 hours and their reporting line to the manager"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "      !(await this.customRoles.hasPermission(workspaceId, user.id, 'members.profile.manage'))\n"
b = "      !(await this.customRoles.hasPermission(workspaceId, user.id, 'workspace.schedule.manage'))\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pca-6-capacity-asks-an-admins-key: PATCH members/:userId/capacity asks workspace.schedule.manage')
