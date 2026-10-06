# THE CUSTOMIZE PANEL'S PROTECT VIEW IS PRESSED BY NOBODY, whatever the view says.
# Reddens: view-writes-by-level: "on a view of their own where the default is Edit the Customize panel lets the member press Pin, Private, Protect and Set as default, and the pin and the default they press are saved"
#   or "once it is the list’s default the panel no longer offers to make it private, which the server refuses for the default, and still offers to protect it"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """              checked={view.visibility === 'protected'}
              disabled={!viewOffersOf(view).visibility}
"""
b = """              checked={view.visibility === 'protected'}
              disabled={true}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-39-protect-pressed-by-nobody: the customize panel's protect view is pressed by nobody")
