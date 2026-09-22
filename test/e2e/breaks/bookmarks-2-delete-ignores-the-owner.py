# `remove` drops `userId` from its WHERE, so knowing a bookmark's id is enough
# to delete somebody else's.
#
# The method's own comment says what that costs: "the id is the only thing
# standing between the two people otherwise". Workspace scoping stays, so this
# is not a cross-tenant hole — it is a colleague, inside the same workspace,
# deleting a private row.
#
# THIS PATCH HAS ALREADY EARNED ITS KEEP ONCE, against an earlier version of
# the check. The suite's comment records it: the first version of that check
# used an ANONYMOUS caller, and an anonymous caller is stopped by the auth
# guard long before the WHERE clause, so it passed cleanly against exactly this
# edit. It is checked against another signed-in person now, which is the only
# shape that can tell the two apart.
#
# IT REDDENS THREE, NOT THE ONE PREDICTED, and the two extra are honest. The
# peer's delete succeeds, so the external bookmark really is gone — the card
# check below then reads a list that no longer contains it, and the
# element-kind check looks up a testid that no longer renders. That is the
# patch's own damage propagating rather than a weakness in those checks: a
# deleted row cannot be shown. Recorded because the prediction was too narrow,
# and a prediction that is too narrow is the one that hides a cascade nobody
# reasoned about.
#
# Reddens: bookmarks: "and a colleague who knows the id still cannot delete it"
import io
p = '/home/user/rundesk/apps/api/src/modules/bookmarks/bookmarks.service.ts'
a = """          eq(workspaceBookmarks.workspaceId, workspaceId),
          eq(workspaceBookmarks.userId, userId),
        ),
      )
"""
b = """          eq(workspaceBookmarks.workspaceId, workspaceId),
        ),
      )
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bookmarks.service.ts: a delete is no longer scoped to the bookmark\'s owner.')
