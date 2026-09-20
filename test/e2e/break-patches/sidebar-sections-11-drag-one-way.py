# THE REGRESSION THIS RUN CAUGHT, put back exactly: gate the space target on
# `parentId`, the tree payload's folderId, which is a refetch behind the move
# that just happened. Dropping INTO a folder still works (null !== <uuid>);
# dropping back OUT never arms (null !== null), so the gesture is one-way.
# Reddens: sidebar-sections: "the space row arms as a drop target for a project
#          that is in a folder" / "dragging it back onto the space takes it out
#          of the folder"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    if (dragItem.kind === 'project') return target.kind === 'folder' || target.kind === 'space'"
b = "    if (dragItem.kind === 'project') {\n      if (target.kind === 'folder') return true\n      if (target.kind === 'space') return (dragItem as { parentId?: string | null }).parentId != null\n      return false\n    }"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the space target is gated on the stale parentId again — drag into a folder works, drag back out never arms.')
