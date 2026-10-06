# THE CUSTOMIZE PANEL'S SET AS DEFAULT IS PRESSED BY EVERYBODY on a view that is not the default.
# Reddens: view-writes-by-level: "the Customize panel draws the admin’s view’s Pin, Private, Protect and Set as default for the member without letting them be pressed, and leaves them Autosave, their own"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '              disabled={!!view.isDefault || !viewOffersOf(view).makeDefault}\n'
b = '              disabled={!!view.isDefault}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-15-set-default-pressed-by-all: the customize panel's set as default is pressed by everybody on a view that is not the default")
