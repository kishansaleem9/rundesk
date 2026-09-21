# The tree stops sorting by `position` and draws the siblings in the reverse of
# whatever `/projects/space/:id` returned — which has no ORDER BY of its own, so
# before this row that was simply "whatever the query plan produced". The write
# still lands and nothing reads it: the column goes back to being a stored value
# no reader honours.
# Reddens: sidebar-reorder "the tree draws the projects in the order the server stored"
#      and sidebar-reorder "and the tree redraws the new order on a fresh load"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = """          const ordered = [...projectsWithLists].sort(
            (a, b) =>
              (a.position ?? 0) - (b.position ?? 0) ||
              String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')),
          )
"""
b = "          // BROKEN: position is written by the endpoint and read by nobody.\n          const ordered = [...projectsWithLists].reverse()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the tree no longer sorts by position.')
