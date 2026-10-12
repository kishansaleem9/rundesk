# EVERY MEMBER IS OFFERED ADD CREDITS.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "a member reads the same credits, and is offered no Add credits"
#
# The billing permission is not asked.
import io
p = '/home/user/rundesk/apps/web/src/components/ai-credits.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const mayBuy = usePermissions(workspaceId).can('workspace.billing') === true",
     "  const mayBuy = usePermissions(workspaceId).can('workspace.billing') !== undefined || true"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-w4-add-credits-for-everyone: EVERY MEMBER IS OFFERED ADD CREDITS.')
