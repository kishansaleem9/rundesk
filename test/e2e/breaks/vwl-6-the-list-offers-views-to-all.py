# THE LIST'S ANSWER OFFERS A NEW SHARED VIEW TO EVERYBODY, whatever their level.
# Re-aimed 8 October: the answer is written one key a line, with `privateViews` after it (`view-only-individual-permissions`).
# Reddens: view-writes-by-level: "the API says who may add a shared view — not the view-only member, the guest or the commenter; the member at Edit — and, view by view, that a reader may change nothing of the admin’s and only their own private view, never as the default, and that deleting one is offered at Full edit, not at Edit"
#   or "in a view-only list the page offers the member no + View, no ⋯ on the admin’s views — no Update, Rename, Make default or Delete — and no Save view once they change one, on a saved view or a built-in tab"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      views: actor.role === 'super_admin' || spaceLevelReaches(level, SHARED_VIEW_LEVEL),\n"
b = '      views: true,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-6-the-list-offers-views-to-all: the list offers a new shared view to everybody")
