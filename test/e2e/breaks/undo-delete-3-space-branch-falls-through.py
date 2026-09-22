# `restore`'s branch for `space` is removed, so restoring a space falls through
# the if/else chain, writes nothing, logs the audit event and answers 200.
#
# An if/else chain over a string type has no default case and no exhaustiveness
# check: the compiler is perfectly happy for a member of the union to match
# none of the branches, so losing one is a silent behaviour change and not a
# build error. `TRASH_TYPES` is an `as const` tuple used as a type, so the type
# still says a space can be restored while the code no longer restores one.
#
# WHAT IT EXISTS TO PROVE. "and so can a space" asserts `status < 300`, and
# this patch answers 200 — it would have passed. The read-back check beside it
# is the one that reddens, and it is the reason both checks are there rather
# than just the first. This patch is the smallest demonstration that the status
# code and the row are two different claims.
#
# Reddens: undo-delete: "and the space row comes back un-archived too"
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
a = """    if (type === 'space') {
      await this.db.update(spaces).set(clear).where(eq(spaces.id, id))
    } else if (type === 'folder') {
"""
b = """    if (type === 'folder') {
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trash.service.ts: restoring a space now matches no branch and quietly does nothing.')
