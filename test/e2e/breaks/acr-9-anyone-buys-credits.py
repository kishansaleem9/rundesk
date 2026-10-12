# ANY MEMBER STARTS A CREDITS CHECKOUT.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "only whoever holds billing adds credits (a member is refused, 403); credits come in packs of 10,000 (400, in words); and a server with no payment provider says so — nothing kept (read by SQL)"
#
# The credits checkout asks no permission.
import io
p = '/home/user/rundesk/apps/api/src/modules/billing/billing.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  @Post(':workspaceId/billing/ai-credits/checkout')\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('workspace.billing')\n",
     "  @Post(':workspaceId/billing/ai-credits/checkout')\n  @UseGuards(WorkspaceMemberGuard)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-9-anyone-buys-credits: ANY MEMBER STARTS A CREDITS CHECKOUT.')
