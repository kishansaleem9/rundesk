# THE STATUS GIVES EVERY MEMBER THE INVOICES, AS IT DID: a guest reads their Stripe links.
# Reddens: billing-key: "the guest and the manager are shown the plan and no invoice or its links — the member granted workspace.billing and the admin are shown the invoice"
import io
p = '/home/user/rundesk/apps/api/src/modules/billing/billing.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (!opts.accounts) {\n'
b = '    if (!opts.accounts && false) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('bil-1-invoices-for-everyone: accounts are never hidden')
