# THE DIALOG'S SAVE SENDS THE NAME ALONE: the contact email typed is dropped.
# Reddens: client-edit: "the manager sets a client’s contact email from the project page’s Manage clients, and it is saved"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        body: { name: name.trim(), contactEmail: email.trim() },\n'
b = '        body: { name: name.trim() },\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cle-7-email-not-sent: the email is not sent')
