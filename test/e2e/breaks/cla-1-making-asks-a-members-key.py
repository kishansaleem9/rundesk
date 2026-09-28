# MAKING A CLIENT ASKS A KEY EVERY MEMBER HOLDS: a plain member makes one.
# Reddens: client-access: "a plain member makes no client (403, nothing written) — the manager and a member granted client.manage each make one, and so does the admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('client.manage')\n  create("
b = "  @RequirePermissions('report.view.basic')\n  create("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-1-making-asks-a-members-key: making a client asks report.view.basic')
