# MANAGE CLIENTS IS OFFERED TO EVERYBODY WHO READS THE CLIENTS.
# Reddens: client-edit: "the plain member’s project page lists the clients and offers no Manage clients"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              {mayAddClient === true && clients.length > 0 && (\n'
b = '              {(mayAddClient === true || Boolean(1)) && clients.length > 0 && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cle-6-manage-for-everyone: Manage clients is offered to all')
