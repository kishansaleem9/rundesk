# The listing drops its user scope, so every member of a list sees everybody
# else's saved filters.
#
# A saved filter is a private working set — "urgent and mine", "the three
# things I am avoiding" — and a name is a sentence somebody wrote for
# themselves. This does not leak task data, which is what makes it survivable
# for a long time: nothing appears that the viewer could not already see. What
# leaks is how a colleague works, and their names for it.
#
# It also breaks the feature quietly rather than loudly. The panel's Saved
# filters menu fills up with a workspace's worth of presets, so the one thing
# it is for — reaching your own set in one click — stops working while the
# control looks healthier than ever.
#
# `eq(listFilterPresets.userId, userId)` is the second clause of a two-clause
# `and`, beside a clause about the list, in a method whose name says nothing
# about people.
#
# ONE CHECK. The delete scope is a separate clause in a separate method, so
# "and cannot delete one" stays green — which is the pair that matters here:
# reading and deleting are two scopes and a patch that took both would prove
# only that scoping exists somewhere.
#
# Reddens: list-filters: "another member on the same list sees none of yours"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/list-filters.service.ts'
a = "      .where(and(eq(listFilterPresets.listId, listId), eq(listFilterPresets.userId, userId)))"
b = "      .where(eq(listFilterPresets.listId, listId))"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list-filters.service.ts: the filter listing is no longer scoped to the viewer.')
