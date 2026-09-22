# `engagementScores` stops narrowing to the caller, so "Trending For You" counts
# everybody's opens.
#
# Both menu entries now read the same rows and return the same order, which
# makes one of the two decoration. It is the duplicated-list defect in its
# purest form: nothing is broken, nothing errors, and the second entry answers
# a question it was never asked.
#
# THE ONLY CHECK IT MOVES IS THE ONE THAT SEPARATES THE TWO MODES. The peer
# opens their pick nine times and I open mine five, so under this patch the
# workspace answer and the personal answer are both led by the peer's — which
# means "a colleague's opens move the workspace list" still passes, and only
# "and leave mine alone" reddens. A patch that reddened both would prove the
# trending machinery works; this one proves the two modes are two modes.
#
# Deleting the ternary rather than inverting it, because `mine ? … : undefined`
# reads as an optional narrowing and dropping an optional narrowing is what a
# "simplify this where clause" change does. The `mine` parameter is left in
# place and unused — the API build has no `noUnusedLocals`, and a patch that
# also edits the signature is a patch whose failure mode includes the callers.
#
# Reddens: trending-sort: "and leave mine alone — \"for you\" is my opens, not everybody's"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = """          gte(searchEngagement.openedAt, since),
          mine ? eq(searchEngagement.userId, userId) : undefined,
"""
b = """          gte(searchEngagement.openedAt, since),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: "Trending For You" now counts the whole workspace, same as the other mode.')
