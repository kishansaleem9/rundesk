# THE INVOICES ASK A KEY EVERY MEMBER HOLDS: the manager is shown them.
# Reddens: billing-key: "the guest and the manager are shown the plan and no invoice or its links — the member granted workspace.billing and the admin are shown the invoice"
import io
p = '/home/user/rundesk/apps/api/src/modules/billing/billing.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "(await this.roles.hasPermission(workspaceId, user.id, 'workspace.billing'))"
b = "(await this.roles.hasPermission(workspaceId, user.id, 'report.view.basic'))"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('bil-4-invoices-ask-a-members-key: the invoices ask report.view.basic')
