# The endpoint writes 1,3,5 instead of 0,1,2. The RELATIVE order is still right,
# so the tree draws the same thing and every "did A end up before B" check stays
# green, while the column quietly stops being an index.
# Reddens: sidebar-reorder "and the positions in the database are 0,1,2 — contiguous, not merely different"
#      and sidebar-reorder "and the server kept it — the stored positions are the new order"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = """    await Promise.all(
      orderedIds.map((id, position) =>
        kind === 'folder'
          ? this.db.update(folders).set({ position }).where(eq(folders.id, id))
          : this.db.update(projects).set({ position, updatedAt: now }).where(eq(projects.id, id)),
      ),
    )
"""
b = """    // BROKEN: positions are spaced, not indexed.
    await Promise.all(
      orderedIds.map((id, i) =>
        kind === 'folder'
          ? this.db.update(folders).set({ position: i * 2 + 1 }).where(eq(folders.id, id))
          : this.db.update(projects).set({ position: i * 2 + 1, updatedAt: now }).where(eq(projects.id, id)),
      ),
    )
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspaces.service.ts: reorder writes positions 1,3,5 instead of 0,1,2.')
