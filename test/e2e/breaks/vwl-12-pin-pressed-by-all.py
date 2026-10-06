# THE CUSTOMIZE PANEL'S PIN IS PRESSED BY EVERYBODY, whatever the view says.
# Reddens: view-writes-by-level: "the Customize panel draws the admin’s view’s Pin, Private, Protect and Set as default for the member without letting them be pressed, and leaves them Autosave, their own"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '              disabled={!viewOffersOf(view).change}\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-12-pin-pressed-by-all: the customize panel's pin is pressed by everybody, whatever the view says")
