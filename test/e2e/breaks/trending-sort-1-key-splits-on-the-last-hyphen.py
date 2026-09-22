# `engagementKey` splits the hit id on its LAST hyphen instead of its first.
#
# The file's own comment names this defect and says what it looks like: "a uuid
# contains four more, and splitting on all of them silently produces a key that
# matches nothing — a trending sort that quietly scores everything zero and
# looks exactly like a sort nobody uses". `lastIndexOf` is the one-token version
# of that mistake and the one somebody actually writes, because `indexOf` and
# `lastIndexOf` differ by four characters and both read as "find the hyphen".
#
# A hit id is `task-<uuid>`; the engagement table stores `task` and `<uuid>` in
# separate columns. Splitting at the last hyphen produces
# `task-4f1c-…-a7b2:9e3d0c11ff40`, which matches no row, so every hit scores
# zero.
#
# WHAT STAYS GREEN IS THE TELL. Equal scores keep the incoming order, so the
# tail check — "and leaves the rest exactly as relevance had them" — passes
# under this patch, exactly as it would under a build with no trending sort at
# all. That is the signature the suite was shaped to catch: the tail is not the
# thing that proves trending works, the top is.
#
# AND IT CAUGHT A THIRD CHECK BEING WEAKER THAN IT READ. On its first run this
# reddened two checks, not the three predicted: "a colleague's opens move the
# workspace list" passed. The colleague's pick was `restBefore[0]` — whatever
# relevance had already put first — so under a build that scores everything
# zero it is still first, and the check could not tell a working workspace
# sort from no sort at all. It picks `restBefore[1]` now, and this patch
# reddens three.
#
# Reddens: trending-sort: "opening the least relevant hit five times puts it first"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = """function engagementKey(hitId: string): string {
  const at = hitId.indexOf('-')
"""
b = """function engagementKey(hitId: string): string {
  const at = hitId.lastIndexOf('-')
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: engagement keys are built from the last hyphen, so they match no stored row.')
