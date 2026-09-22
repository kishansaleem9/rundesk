# `sort=trending` drops off the controller's whitelist, so the workspace mode
# falls through to relevance.
#
# The whitelist's own comment says why it is a whitelist: "an unrecognised name
# has to be DROPPED, because a sort the service does not know silently returns
# relevance and reads as 'the control did nothing'". This patch is that comment
# happening — the service still implements both modes perfectly and one of the
# two menu entries simply never reaches it.
#
# ONE MODE, NOT BOTH. `trending_me` stays on the list, so "and leave mine alone"
# still passes and the two checks that redden are the two that ask the workspace
# question. A patch that removed both names would redden three checks and leave
# the suite unable to say which half of the feature it had proven — and these
# two halves are separately reachable, separately spelled, and separately
# droppable.
#
# It is also the cheapest regression in the file to cause: the line is a
# four-way `||` chain of string literals, and losing one of them is a
# merge-conflict resolution, not a decision.
#
# Reddens: trending-sort: "a colleague's opens move the workspace list"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.controller.ts'
a = "    if (sort === 'updated' || sort === 'created' || sort === 'trending' || sort === 'trending_me') {"
b = "    if (sort === 'updated' || sort === 'created' || sort === 'trending_me') {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.controller.ts: sort=trending is no longer recognised, so it silently returns relevance.')
