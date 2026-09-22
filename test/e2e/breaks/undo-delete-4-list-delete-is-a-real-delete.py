# `DELETE /lists/:id` removes the row instead of archiving it.
#
# The premise of this whole item is that these deletes are soft. If a list is
# really gone there is nothing for Undo to restore, and the button on the toast
# becomes, in the suite's words, a button that apologises. The suite states
# that premise as its first two checks specifically so that a change here
# fails first and says why, instead of the undo quietly becoming a lie three
# checks later.
#
# It is a plausible change, which is the point: "the nightly purge handles
# retention, so the delete endpoint can just delete" is a reasonable-sounding
# sentence, and `update … set isArchived` → `delete` is one line. Nothing else
# in the API stops it — the row has no dependents that would raise, and the
# audit event is written either way.
#
# It reddens the premise check, the restore beside it (there is no row to
# un-archive), and the browser's read-back after pressing Undo. The project
# and space halves are untouched and stay green, so the failure names the type
# it happened to rather than "restore is broken".
#
# Reddens: undo-delete: "the row survives the delete, archived"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = """    await this.db
      .update(lists)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
      .where(eq(lists.id, listId))
"""
b = """    await this.db.delete(lists).where(eq(lists.id, listId))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: deleting a list now removes the row, so there is nothing to undo.')
