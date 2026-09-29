# ANY MEMBER CHANGES A CLIENT: the update asks no key.
# Reddens: client-edit: "a plain member changing a client is refused (403), and nothing changes"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Patch(':clientId')\n  @RequirePermissions('client.manage')\n  update("
b = "  @Patch(':clientId')\n  update("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cle-2-update-for-anyone: the update asks no key')
