# The endpoint validates the request, answers 200, and then writes the positions
# in the order the siblings ALREADY had. The browser's request is provably
# correct and nothing moves — the server-side half of the drag-out defect, and
# the reason the suite asks what was SENT as well as what is stored.
# Reddens: sidebar-reorder "and the server kept it — the stored positions are the new order"
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
b = """    // BROKEN: writes the order it already had, not the one it was sent.
    await Promise.all(
      siblings.map((row, position) =>
        kind === 'folder'
          ? this.db.update(folders).set({ position }).where(eq(folders.id, row.id))
          : this.db.update(projects).set({ position, updatedAt: now }).where(eq(projects.id, row.id)),
      ),
    )
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspaces.service.ts: the reorder endpoint ignores the order it is sent.')
