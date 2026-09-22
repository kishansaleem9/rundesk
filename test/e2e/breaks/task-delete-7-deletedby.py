# Check 7 — the Trash row says WHO deleted it. Join the "Deleted by" name on
# the archive column instead, which a delete never fills, so it reads as nobody.
#
# Reddens: task-delete: "and it arrives in the same Trash as every other deleted thing, with who and where"
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "        .leftJoin(users, eq(users.id, tasks.deletedById))"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "        .leftJoin(users, eq(users.id, tasks.archivedById))"))
print('BROKE check 7: the Trash resolves a deleted task\'s "Deleted by" from archivedById')
