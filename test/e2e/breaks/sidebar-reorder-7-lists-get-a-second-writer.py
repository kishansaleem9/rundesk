# Lists stop using the reorder route they already had and go through the new
# workspaces endpoint instead — a second writer for `lists.position`, which is
# the duplicated-logic defect this codebase keeps producing. The endpoint does
# not accept `kind: 'list'`, so the drag now 400s.
# Reddens: sidebar-reorder "a list reorder goes to `POST /lists/project/:id/reorder`, not to a second writer for the same column"
#      and sidebar-reorder "and the lists are stored in the new order"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "      await api(`/lists/project/${gap.containerId}/reorder`, { method: 'POST', body: { orderedIds } })\n      return\n"
b = "      // BROKEN: one column, two writers.\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: list reorders are routed through the projects endpoint.')
