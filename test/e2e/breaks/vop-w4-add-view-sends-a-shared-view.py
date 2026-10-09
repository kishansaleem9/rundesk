# + VIEW SENDS A SHARED VIEW: where only a view of one's own is allowed, the server refuses it.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "the member’s list page offers + View, and pressing it makes a view of their own (private), which their level allows where a shared one it does not"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("          ...(listAccess.views ? {} : { visibility: 'private' }),\n",
     "          ...(listAccess.views || true ? {} : { visibility: 'private' }), // BROKEN: + View sends a shared view\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-w4-add-view-sends-a-shared-view: + view sends a shared view')
