# THE PANEL OFFERS PRIVATE BY WHO MAY CHANGE WHO SEES THE VIEW, on the list's default too, which the server refuses.
# Reddens: view-writes-by-level: "once it is the list’s default the panel no longer offers to make it private, which the server refuses for the default, and still offers to protect it"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "              disabled={view.visibility === 'private' ? !viewOffersOf(view).visibility : !viewOffersOf(view).makePrivate}\n"
b = '              disabled={!viewOffersOf(view).visibility}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-42-private-offered-on-the-default-page: the panel offers private on the list's default")
