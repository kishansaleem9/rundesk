# THE SIDEBAR'S NEW FOLDER OPENS THE CREATE MENU ON ANOTHER TAB: the space is
# chosen, and the form is the List form.
# Reddens: folder-create: "the sidebar’s New folder opens the Create menu’s Folder form, with this space chosen"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "                      onClick={() => setSpaceCreate({ spaceId: space.id, kind: 'folder' })}\n"
b = "                      onClick={() => setSpaceCreate({ spaceId: space.id, kind: 'list' })}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folder-create-13-sidebar-opens-another-tab: New folder opens the List tab')
