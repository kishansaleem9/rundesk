# The tree stops sorting by `position` and draws the siblings in the reverse of
# whatever `/projects/space/:id` returned — which has no ORDER BY of its own, so
# before this row that was simply "whatever the query plan produced". The write
# still lands and nothing reads it: the column goes back to being a stored value
# no reader honours.
#
# RE-AIMED 24 September. The sidebar no longer sorts for itself: the endpoint
# orders by `position`, then age (`commit-log/log-666f15f-1`), and the tree
# draws what it is given. This draws it reversed, a tree that stopped drawing
# the server's order.
# Reddens: sidebar-reorder "the tree draws the projects in the order the server stored"
#      and sidebar-reorder "and the tree redraws the new order on a fresh load"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "          return { ...space, projects: projectsWithLists, folders, spaceLists }\n"
b = "          // BROKEN: the server's order is not the one drawn.\n          return { ...space, projects: [...projectsWithLists].reverse(), folders, spaceLists }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the tree draws the server order reversed.')
