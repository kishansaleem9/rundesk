# THE SIDEBAR'S NEW FOLDER OPENS THE FOLDER FORM WITH NO SPACE CHOSEN, so the
# person picks again the space they pressed it on.
# Reddens: folder-create: "the sidebar’s New folder opens the Create menu’s Folder form, with this space chosen"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "                      onClick={() => setSpaceCreate({ spaceId: space.id, kind: 'folder' })}\n"
b = "                      onClick={() => setSpaceCreate({ spaceId: '', kind: 'folder' })}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folder-create-14-sidebar-space-not-chosen: New folder opens with no space chosen')
