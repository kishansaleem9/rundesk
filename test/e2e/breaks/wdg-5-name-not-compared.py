# THE TYPED NAME IS NOT COMPARED: any string confirms.
# Reddens: workspace-delete-for-good: "the route refuses an admin who does not own its organization, a workspace that is not archived, and a name typed wrong — and the workspace stays"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "    if (typeof confirmName !== 'string' || confirmName !== ws.name) {\n"
b = "    if (typeof confirmName !== 'string') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-5-name-not-compared: applied")
