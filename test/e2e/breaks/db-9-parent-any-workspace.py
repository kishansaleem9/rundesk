# THE PARENT RULE WITHOUT ITS BOUNDARY: any doc id, in any workspace, becomes a parent.
# Reddens: doc-boundaries: "a doc cannot be created under a doc in another workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (!parent || parent.workspaceId !== workspaceId) throw new NotFoundException('Parent doc not found')\n"
b = "    if (!parent) throw new NotFoundException('Parent doc not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-9-parent-any-workspace: applied")
