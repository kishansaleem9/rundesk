# THE FACADE. A box that accepts typing, keeps it on screen until the dialog
# closes, and never puts it in the request. The folder is created, the dialog
# reports success, and the words are gone — indistinguishable from a working
# field in every screenshot anyone would take.
# Reddens: folder-dialog: "the words typed in the dialog are on the folder the server made"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "        body: { name, description, statusScope },"
b = "        body: { name, statusScope },"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the description is typed, held, and never sent.')
