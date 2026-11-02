# THE OWNER LEAVES, and the workspace is left with nobody who owns it.
# Reddens: workspace-ownership: "the owner is refused leaving with the reason — transfer its ownership first — and stays; somebody not in it finds nothing to leave"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspace-ownership.ts'
a = '  if (facts.ownerId === me) {\n'
b = '  if (facts.ownerId === me && Boolean(0)) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-6-owner-leaves: applied")
