# `remove` drops its user scope, so a colleague who knows a filter's id can
# delete it.
#
# The method's comment is one line and this patch is its negation: "Scoped by
# user, so one person cannot delete another's saved filter."
#
# The id is the only thing standing between the two people, and the listing
# hands ids out — so on a build where reading is correctly scoped, this is
# reachable only by someone who has seen the id another way. On a build where
# it is not, the two patches compose into "anybody can delete anybody's", which
# is why the suite checks reading and deleting separately.
#
# The 404 is doing real work in the check: `remove` throws NotFound when the
# scoped delete matches nothing, so the same status means "not yours" and "does
# not exist" — deliberately, because telling those apart would confirm that
# somebody else's filter exists. A 200 is therefore the whole failure.
#
# IT REDDENS TWO, AND THE SECOND IS AN HONEST CASCADE. The peer's delete
# succeeds, so the row is gone — and "while you can delete your own" then
# answers 404, because there is nothing left to delete. Predicted one; the
# extra failure is the patch's own damage rather than a weak check, and the
# order is the suite's: it tests the refusal before the permission, which is
# the right order for every other build.
#
# Reading stays scoped, so the check above both of them passes.
#
# Reddens: list-filters: "and cannot delete one"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/list-filters.service.ts'
a = "      .where(and(eq(listFilterPresets.id, id), eq(listFilterPresets.userId, userId)))"
b = "      .where(eq(listFilterPresets.id, id))"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list-filters.service.ts: a saved filter can be deleted by anybody who knows its id.')
