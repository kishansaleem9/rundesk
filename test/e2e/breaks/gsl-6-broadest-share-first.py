# THE BROADEST SHARE DECIDES, not the most specific: a guest's "comment" on a
# list outranks the "edit" on its task. No suite shares one guest two levels
# on one chain, so the order is the resolver's own test's.
# Re-aimed 25 September: a member's grants have a loop of their own now; this is the guest's (`project-roles-narrow-nothing`).
# Reddens: unit: space-default-permission.test.ts "a guest’s share on the item decides, the most specific first"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "      .where(and(eq(objectShares.userId, params.actorId), inArray(objectShares.objectId, params.within.map((step) => step.id))))\n    for (const step of params.within) {\n"
b = "      .where(and(eq(objectShares.userId, params.actorId), inArray(objectShares.objectId, params.within.map((step) => step.id))))\n    for (const step of [...params.within].reverse()) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gsl-6-broadest-share-first: the chain is read broadest first')
