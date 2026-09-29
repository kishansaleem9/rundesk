# NOTHING CHANGES A CLIENT AGAIN: the update route is gone.
# Reddens: client-edit: "a manager renames a client and sets the contact email an invoice prints (200)"
#   or "a name another client has is refused (400, “already exists”), a contact email that is not one is refused (400), and an empty one clears it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Patch(':clientId')\n  @RequirePermissions('client.manage')\n  update("
b = "  @Patch(':clientId/never')\n  @RequirePermissions('client.manage')\n  update("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cle-1-no-update-route: the update route is gone')
