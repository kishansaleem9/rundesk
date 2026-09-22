# "Add Bookmark" closes its form and saves nothing.
#
# The facade, in the place it is hardest to notice: the form validates the
# field, the button is disabled until there is a URL, the form closes on
# submit, and the card re-renders. Everything a person can see says it worked.
# The row appears on the next load for anybody who had one already, and for
# anybody who did not the card simply stays empty and reads as "you have no
# bookmarks" — which is the same wrong-answer-in-right-clothes this audit keeps
# finding.
#
# `add.mutate()` becomes `setAdding(false)`, which is what the success handler
# would have done anyway, so the visible behaviour is identical and only the
# server disagrees. That is why the check reads the bookmark list back from the
# API rather than looking at the card: a check written against the screen would
# have passed.
#
# REDDENS THE LAST CHECK ONLY. Both bookmarks created through the API are
# untouched, so the card still lists them and both element-kind checks stay
# green — the failure names the form, not the card.
#
# Reddens: bookmarks: "and Add Bookmark actually saves one, rather than only closing the form"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = "            if (url.trim()) add.mutate()"
b = "            if (url.trim()) setAdding(false)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app.$workspaceId.tsx: the Add Bookmark form now closes without saving.')
