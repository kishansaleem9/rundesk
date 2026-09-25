# A CHECKOUT ASKS ONLY MEMBERSHIP: a guest and a manager change the plan.
# Reddens: billing-key: "a manager and a guest start no checkout (403) — the member granted workspace.billing passes the gate, to be told billing is not configured here"
import io
p = '/home/user/rundesk/apps/api/src/modules/billing/billing.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Post(':workspaceId/billing/checkout')\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('workspace.billing')\n"
b = "  @Post(':workspaceId/billing/checkout')\n  @UseGuards(WorkspaceMemberGuard)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('bil-2-checkout-asks-membership: checkout asks no key')
