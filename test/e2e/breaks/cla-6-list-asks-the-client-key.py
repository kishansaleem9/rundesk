# READING THE CLIENT LIST ASKS client.manage: a plain member's project picker lists nothing.
# Reddens: client-access: "a plain member still lists the workspace’s clients, the admin’s among them, for the project’s picker — a guest lists none (403)"
#   or "the project’s client picker is live for the manager, who may change the project, and disabled — still naming its clients — for a plain member, who may not"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = '  @Get()\n  list('
b = "  @Get()\n  @RequirePermissions('client.manage')\n  list("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-6-list-asks-the-client-key: the client list asks client.manage')
