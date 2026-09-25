# THE PORTAL ASKS ONLY MEMBERSHIP: a manager opens the payment portal.
# Reddens: billing-key: "a manager opens no billing portal (403) — the member granted workspace.billing passes the gate"
import io
p = '/home/user/rundesk/apps/api/src/modules/billing/billing.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Post(':workspaceId/billing/portal')\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('workspace.billing')\n"
b = "  @Post(':workspaceId/billing/portal')\n  @UseGuards(WorkspaceMemberGuard)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('bil-3-portal-asks-membership: the portal asks no key')
