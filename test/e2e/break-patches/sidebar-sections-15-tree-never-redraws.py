# Stop invalidating the tree after a drop. The column moves, the server is
# right, and the sidebar keeps drawing the old arrangement — the state that made
# the one-way bug reachable, and that a database-only check cannot see.
# Reddens: sidebar-sections: "and the sidebar redraws the row inside the folder"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = "      for (const key of ['spaces', 'space-tree', 'projects', 'folders', 'lists', 'move-targets']) {\n        await qc.invalidateQueries({ queryKey: [key] })\n      }"
b = "      for (const key of ['move-targets']) {\n        await qc.invalidateQueries({ queryKey: [key] })\n      }"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: a drop no longer refreshes the tree — the move is invisible until something else refetches.')
