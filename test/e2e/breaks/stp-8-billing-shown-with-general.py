# THE BILLING CARD COMES WITH GENERAL: a member granted workspace.manage is shown billing.
# Reddens: settings-tabs-by-key: "a member granted workspace.manage opens Settings on General, offered the workspace’s name — and no billing, which is workspace.billing’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    {mayBill && <BillingCard workspaceId={workspaceId} />}\n'
b = '    {(mayBill || true) && <BillingCard workspaceId={workspaceId} />}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-8-billing-shown-with-general: billing shown to General')
