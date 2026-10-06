# A SHARE ON ONE VIEW CHANGES NOTHING THE PAGE OFFERS: each view is offered by the list's level alone.
# Reddens: view-writes-by-level: "a member held to View on one view by a share on it, where the default is Edit, is refused changing or deleting that view in the share’s words (403) and is offered nothing on it, while the list’s other views stay theirs to change"
#   or "a member given Full edit on one view of a view-only list by a share on it renames and deletes that view and is offered that on it, but nothing on the list’s other views, and does not choose the list’s default with it (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = '      const level = levelOnView(onList, shareOn.get(viewId) ?? null)\n'
b = '      const level = levelOnView(onList, null)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-30-a-share-on-a-view-offered-nothing: a share on one view changes nothing the page offers")
