# A CLIENT THAT IS NOT THERE IS DELETED "OK" AGAIN.
# Reddens: client-delete-keeps-invoices: "deleting a client that is not there says so (404), not ok"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!row) throw new NotFoundException('Client not found')\n"
b = "    if (!row) return { ok: true }\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cki-2-missing-client-is-ok: a missing client answers ok')
