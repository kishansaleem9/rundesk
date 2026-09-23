# THE TRASH'S JOIN AS IT WAS: whatever space the row names, from any workspace.
# Reddens: doc-boundaries: "and neither does the trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
a = '        .leftJoin(spaces, and(eq(spaces.id, docs.spaceId), eq(spaces.workspaceId, docs.workspaceId)))\n'
b = '        .leftJoin(spaces, eq(spaces.id, docs.spaceId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-15-trash-joins-any-space: applied")
