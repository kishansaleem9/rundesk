# A GUEST'S SHARES BELOW THE SPACE ARE NOT READ: a guest invited to one task,
# list or project holds "view" there, as if nothing were shared.
# Re-aimed 25 September: a member's grants have a loop of their own now; this is the guest's (`project-roles-narrow-nothing`).
# Reddens: guest-space-level: "where only an item is shared with a guest, its level is theirs there — they comment on the shared task and in the shared list, and make a list in the shared project — and not on the task beside them"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "      .where(and(eq(objectShares.userId, params.actorId), inArray(objectShares.objectId, params.within.map((step) => step.id))))\n    for (const step of params.within) {\n"
b = "      .where(and(eq(objectShares.userId, params.actorId), inArray(objectShares.objectId, params.within.map((step) => step.id))))\n    for (const step of params.within.slice(0, 0)) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gsl-3-item-shares-unread: a guest share below the space counts for nothing')
