# `canDropOn` goes back to falling through to the list branch when a folder is in
# flight — which is what it did the moment `folder` joined the drag union. A
# folder dropped on a project row is then accepted, and `dropOn`'s else-branch
# posts it to `/lists/<folderId>/move`: a real route, an id that is not a list.
# Reddens: sidebar-reorder "and a folder dropped on a project sends nothing"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "    if (dragItem.kind === 'list') return target.kind === 'project'\n"
b = "    // BROKEN: a folder now falls through into the list rule.\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: a folder can be dropped onto a project row again.')
