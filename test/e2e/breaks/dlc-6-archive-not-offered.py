# THE MENU OFFERS NO ARCHIVE.
# Reddens: doc-level-controls: "a member with an Edit share types into the doc with Save offered, and its menu offers Archive and Delete"
#   or "Archive from the doc’s menu archives it as the editor’s doing, the menu then offers Unarchive, and Unarchive brings it back"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                    {mayEdit && (\n                      <DropdownMenuItem\n                        disabled={archiveDoc.isPending}'
b = '                    {Boolean(0) && mayEdit && (\n                      <DropdownMenuItem\n                        disabled={archiveDoc.isPending}'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dlc-6-archive-not-offered: Archive is not offered')
