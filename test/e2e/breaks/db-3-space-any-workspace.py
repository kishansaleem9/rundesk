# THE SPACE RULE WITHOUT ITS BOUNDARY: any space id is accepted if the caller
# can reach it — and a member of both workspaces reaches B's.
# Reddens: doc-boundaries: "a doc cannot be created under another workspace’s space — and that space’s name never reaches this workspace’s list"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (!space || space.workspaceId !== workspaceId) throw new NotFoundException('Space not found')\n"
b = "    if (!space) throw new NotFoundException('Space not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-3-space-any-workspace: applied")
