# THE IMPORT PAGE OFFERS A GUEST THE IMPORTS (`found-6-oct/a-guest-who-may-import-makes-a-space`): granted the key, a guest is
# offered both panels, which the API refuses them.
# Reddens: imports: "the import page offers that guest neither the spreadsheet nor the ClickUp import, and says why in the server’s words: “Guests cannot import data into a workspace.”"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const guest = useWorkspaceRole(workspaceId).role === 'guest'\n"
b = "  const guest = useWorkspaceRole(workspaceId).role === 'guest' && false\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-55-import-page-offers-guests-the-imports: the import page reads nobody as a guest')
