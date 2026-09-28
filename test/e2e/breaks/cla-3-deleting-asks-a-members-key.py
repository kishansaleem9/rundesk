# DELETING A CLIENT ASKS A KEY EVERY MEMBER HOLDS: a plain member deletes one.
# Reddens: client-access: "a plain member deletes no client (403, the row stays) — the manager and a member granted client.manage each delete one"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('client.manage')\n  remove("
b = "  @RequirePermissions('report.view.basic')\n  remove("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-3-deleting-asks-a-members-key: deleting a client asks report.view.basic')
