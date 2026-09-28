# WHOM A MEMBER REPORTS TO ASKS ONLY MEMBERSHIP: a plain member rewrites a colleague's reporting line.
# Reddens: people-calendar-access: "a plain member sets no colleague’s capacity or reporting line (403 each) yet reads the roster with both"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('members.profile.manage')\n  async updateMemberManager("
b = '  @UseGuards(WorkspaceMemberGuard)\n  async updateMemberManager('
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pca-7-reports-to-asks-no-key: PATCH members/:userId/manager asks no key')
