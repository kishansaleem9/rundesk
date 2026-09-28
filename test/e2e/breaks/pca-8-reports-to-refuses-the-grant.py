# WHOM A MEMBER REPORTS TO ASKS ANOTHER OF A MANAGER'S KEYS, AS THE MANAGER'S ROLE DID: the member granted members.profile.manage sets no reporting line.
# Reddens: people-calendar-access: "a member granted members.profile.manage sets a colleague’s capacity to 24 hours and their reporting line to the manager"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('members.profile.manage')\n  async updateMemberManager("
b = "  @RequirePermissions('time.approval.manage')\n  async updateMemberManager("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pca-8-reports-to-refuses-the-grant: PATCH members/:userId/manager asks time.approval.manage')
