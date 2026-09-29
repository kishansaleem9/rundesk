# THE DIALOG'S DELETE DOES NOTHING.
# Reddens: client-edit: "the manager deletes a client with no invoices from the same dialog, and it leaves the list"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          onClick={() => remove.mutate()}\n'
b = '          onClick={() => void remove}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cle-8-delete-not-wired: Delete does nothing')
