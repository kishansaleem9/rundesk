# Stop invalidating the tree after a drop ONTO a container. The row moves, the
# server is right, and the sidebar keeps drawing the old arrangement — the state
# that made the one-way bug reachable, and that a database-only check cannot see.
# Reddens: sidebar-sections: "and the sidebar redraws the row inside the folder"
#
# RE-ANCHORED, AND NARROWED. The original anchored on the invalidate loop
# alone, which is now written twice — once in the reorder-into-a-gap path and
# once in `dropOn` — so it matched twice and refused. `dropOn` is the one this
# check watches, so the anchor carries the toast and comment above it, which
# belong to that path only.
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = """      toast.success(t('move.moved'))
      // The same keys the Move dialog invalidates, for the same reason: the
      // tree, the move-target list and the per-container caches all describe
      // the arrangement that just changed.
      for (const key of ['spaces', 'space-tree', 'projects', 'folders', 'lists', 'move-targets']) {
        await qc.invalidateQueries({ queryKey: [key] })
      }"""
b = """      toast.success(t('move.moved'))
      for (const key of ['move-targets']) {
        await qc.invalidateQueries({ queryKey: [key] })
      }"""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: a drop onto a container no longer refreshes the tree — the move is invisible until something else refetches.')
