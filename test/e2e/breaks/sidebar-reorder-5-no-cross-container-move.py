# The drop stops moving an item into the container it landed in and only sends
# the reorder — so dropping a project into a folder's strip posts an order that
# names a project the folder does not contain, and the endpoint refuses it. The
# gesture is armed, the request goes out, and nothing happens.
# Reddens: sidebar-reorder "and the drop both moves it in and places it first"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "      if (!current.includes(item.id)) {\n"
b = "      // BROKEN: never re-parents; the reorder then names a stranger.\n      if (false) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: a drop into another container never moves the item in.')
