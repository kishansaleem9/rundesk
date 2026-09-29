# AN ARCHIVED DOC IS NOT OPENED WHERE IT WENT: the page stays on All, where it no longer is, and Unarchive is nowhere.
# Reddens: doc-level-controls: "Archive from the doc’s menu archives it as the editor’s doing, the menu then offers Unarchive, and Unarchive brings it back"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = "      openIn(id, archive ? 'archived' : 'all')\n"
b = "      openIn(id, 'all')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dlc-8-archived-doc-lost: the archived doc is not followed')
