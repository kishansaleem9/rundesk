# THE DOC HAS NO MENU AGAIN: nothing archives or deletes it.
# Reddens: doc-level-controls: "a member with an Edit share types into the doc with Save offered, and its menu offers Archive and Delete"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              {(mayEdit || mayDelete) && (\n                <DropdownMenu>'
b = '              {Boolean(0) && (mayEdit || mayDelete) && (\n                <DropdownMenu>'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dlc-5-no-doc-menu: the doc menu is gone')
