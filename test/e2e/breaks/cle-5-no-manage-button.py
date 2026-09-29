# THE PROJECT PAGE OFFERS NO MANAGE CLIENTS AGAIN.
# Reddens: client-edit: "the manager sets a client’s contact email from the project page’s Manage clients, and it is saved"
#   or "the manager deletes a client with no invoices from the same dialog, and it leaves the list"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              {mayAddClient === true && clients.length > 0 && (\n'
b = '              {Boolean(0) && mayAddClient === true && clients.length > 0 && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cle-5-no-manage-button: Manage clients is not offered')
