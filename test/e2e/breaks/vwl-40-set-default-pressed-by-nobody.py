# THE CUSTOMIZE PANEL'S SET AS DEFAULT IS PRESSED BY NOBODY, whatever the view says.
# Reddens: view-writes-by-level: "on a view of their own where the default is Edit the Customize panel lets the member press Pin, Private, Protect and Set as default, and the pin and the default they press are saved"
#   or "once it is the list’s default the panel no longer offers to make it private, which the server refuses for the default, and still offers to protect it"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '              disabled={!!view.isDefault || !viewOffersOf(view).makeDefault}\n'
b = '              disabled={true}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-40-set-default-pressed-by-nobody: the customize panel's set as default is pressed by nobody")
