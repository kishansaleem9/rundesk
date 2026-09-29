# UNARCHIVE ARCHIVES: the menu's one item always archives.
# Reddens: doc-level-controls: "Archive from the doc’s menu archives it as the editor’s doing, the menu then offers Unarchive, and Unarchive brings it back"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                        onSelect={() => archiveDoc.mutate({ id: activeDoc.id, archive: !activeDoc.isArchived })}\n'
b = '                        onSelect={() => archiveDoc.mutate({ id: activeDoc.id, archive: true })}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dlc-7-unarchive-archives: Unarchive archives')
