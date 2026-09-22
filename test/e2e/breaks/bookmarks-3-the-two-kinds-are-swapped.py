# The card tells the two kinds of bookmark apart backwards: an in-app path is
# rendered as an anchor and an external URL as a router button.
#
# `b.url.startsWith('/')` becomes `b.url.startsWith('http')` — same method,
# same shape, one word. This is the defect the suite says the whole table
# exists to avoid: "a router handed an absolute URL goes nowhere". Clicking a
# saved `https://` link now asks TanStack Router to navigate to it, which
# resolves to nothing; clicking a saved `/app/…` path leaves the application
# for a URL relative to the current origin, in a new tab, losing the router
# state it was saved to return to.
#
# WHY AN INVERSION RATHER THAN A DELETION. Rendering everything as one kind
# reddens the same two checks and models a defect nobody would write. The two
# branches are correct code with one predicate between them, and the predicate
# is the thing that can be wrong — so the patch changes the predicate.
#
# REDDENS BOTH ELEMENT-KIND CHECKS AND NOTHING ELSE. Both bookmarks still
# render, the card still lists them, the titles are unchanged — which is
# exactly why the suite checks `tagName` and `target` rather than that
# something appeared.
#
# Reddens: bookmarks: "an external bookmark is a real link that opens a new tab"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = "              {b.url.startsWith('/') ? ("
b = "              {b.url.startsWith('http') ? ("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app.$workspaceId.tsx: external bookmarks render as router buttons and in-app ones as links.')
