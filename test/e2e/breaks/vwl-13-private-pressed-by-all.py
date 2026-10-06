# THE CUSTOMIZE PANEL'S PRIVATE VIEW IS PRESSED BY EVERYBODY, whatever the view says — on the list's default too.
# Reddens: view-writes-by-level: "the Customize panel draws the admin’s view’s Pin, Private, Protect and Set as default for the member without letting them be pressed, and leaves them Autosave, their own"
#   or "once it is the list’s default the panel no longer offers to make it private, which the server refuses for the default, and still offers to protect it"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "              disabled={view.visibility === 'private' ? !viewOffersOf(view).visibility : !viewOffersOf(view).makePrivate}\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-13-private-pressed-by-all: the customize panel's private view is pressed by everybody, whatever the view says")
