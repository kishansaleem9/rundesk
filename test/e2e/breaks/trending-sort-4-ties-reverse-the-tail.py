# The trending tiebreak runs backwards: `(a.i - b.i)` becomes `(b.i - a.i)`.
#
# Most hits have never been opened, so the tiebreak decides the order of nearly
# the whole list. Reversed, the unopened tail comes back in the opposite of the
# order relevance gave it — "a sort that reorders the top and randomises the
# rest", as the code's own comment puts it, which is worse than no sort at all
# because the top few look right.
#
# WHY NOT SIMPLY DELETE THE TIEBREAK. `Array.prototype.sort` has been stable
# since ES2019 and V8 implements it with TimSort, so `(a, b) => b.score -
# a.score` alone preserves the incoming order for equal scores and this suite
# would stay green — a patch that models the defect the comment warns about,
# runs green, and means nothing. Reversing is the smallest edit that actually
# moves the tail, and a reversed comparator is a real mistake: the score half
# above it IS `b - a`, so making the second half match it is the natural
# "consistency" fix.
#
# It reddens exactly one check. The promoted hit still has the top score, so
# "puts it first", "a colleague's opens move the workspace list" and "leave
# mine alone" all stay green — which is what makes the tail check a check
# rather than a restatement of the three around it.
#
# Reddens: trending-sort: "and leaves the rest exactly as relevance had them"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      scored.sort((a, b) => (b.score - a.score) || (a.i - b.i))"
b = "      scored.sort((a, b) => (b.score - a.score) || (b.i - a.i))"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: the unopened tail now comes back reversed instead of as relevance had it.')
