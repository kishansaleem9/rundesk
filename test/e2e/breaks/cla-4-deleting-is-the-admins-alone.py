# DELETING A CLIENT IS THE ADMINS' ALONE: the manager and the member granted client.manage are refused.
# Reddens: client-access: "a plain member deletes no client (403, the row stays) — the manager and a member granted client.manage each delete one"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('client.manage')\n  remove("
b = "  @RequirePermissions('workspace.manage')\n  remove("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-4-deleting-is-the-admins-alone: deleting a client asks workspace.manage')
