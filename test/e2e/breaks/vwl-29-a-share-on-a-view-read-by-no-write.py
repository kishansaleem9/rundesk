# A SHARE ON ONE VIEW IS READ BY NO WRITE TO IT: the routes ask the list's level alone, so a member held
# to View on a view changes and deletes it, and one given Full edit on a view of a view-only list is refused.
# Reddens: view-writes-by-level: "a member held to View on one view by a share on it, where the default is Edit, is refused changing or deleting that view in the share’s words (403) and is offered nothing on it, while the list’s other views stay theirs to change"
#   or "a member given Full edit on one view of a view-only list by a share on it renames and deletes that view and is offered that on it, but nothing on the list’s other views, and does not choose the list’s default with it (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = "      within: on.viewId ? [{ type: 'view', id: on.viewId }, ...place.within] : place.within,\n"
b = '      within: place.within,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-29-a-share-on-a-view-read-by-no-write: a share on one view is read by no write to it")
