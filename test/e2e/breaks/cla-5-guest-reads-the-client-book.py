# A GUEST READS THE WORKSPACE'S CLIENT LIST, AS THEY DID: every name and contact address.
# Reddens: client-access: "a plain member still lists the workspace’s clients, the admin’s among them, for the project’s picker — a guest lists none (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (req.workspaceMember?.role === 'guest') throw new ForbiddenException('The workspace’s clients are not a guest’s to read')\n"
b = "    if (req.workspaceMember?.role === 'guest' && !req) throw new ForbiddenException('The workspace’s clients are not a guest’s to read')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-5-guest-reads-the-client-book: a guest reads the client list')
