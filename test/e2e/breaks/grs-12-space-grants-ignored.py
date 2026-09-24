# A GUEST'S SPACE MEMBERSHIP GRANTS NOTHING: a space they were added to reads
# as shared with nobody, its tasks and docs refused.
# Reddens: guest-read-scope: "in a space shared with a guest, they read its tasks, by id and in their list"
#   or "a guest reads the docs of a space shared with them and a doc shared with them — not the open space’s, nor the workspace’s — and the docs hub lists the same; a member reads the open space’s"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/guest-reach.ts'
a = "  or(\n    inArray(col, db.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, actorId))),\n    inArray(col, sharedIds(db, actorId, 'space')),\n  )!"
b = "  or(\n    inArray(col, sharedIds(db, actorId, 'space')),\n  )!"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("grs-12-space-grants-ignored: a guest's space membership grants nothing")
