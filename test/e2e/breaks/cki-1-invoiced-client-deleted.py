# A CLIENT WITH INVOICES IS DELETED AGAIN, AND ITS INVOICES WITH IT.
# Reddens: client-delete-keeps-invoices: "a client with an invoice is not deleted (409), and neither is the invoice"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (Number(n) > 0) {\n"
b = "    if (Number(n) > 0 && Boolean(0)) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cki-1-invoiced-client-deleted: invoices are not asked')
