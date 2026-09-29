# THE MENU OFFERS NO DELETE.
# Reddens: doc-level-controls: "a member with an Edit share types into the doc with Save offered, and its menu offers Archive and Delete"
#   or "Delete from the doc’s menu sends it to the Trash, the editor’s own, as deleted by them"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                    {mayDelete && !activeDoc.isArchived && (\n'
b = '                    {Boolean(0) && mayDelete && !activeDoc.isArchived && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dlc-9-delete-not-offered: Delete is not offered')
