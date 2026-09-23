# A LIST JOIN AIMED WRONG: safe, and no doc shows its own space's name.
# Reddens: doc-boundaries: "the doc list names no space of another workspace — and still names its own"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = '      .leftJoin(spaces, and(eq(spaces.id, docs.spaceId), eq(spaces.workspaceId, docs.workspaceId)))\n'
b = '      .leftJoin(spaces, and(eq(spaces.id, docs.spaceId), eq(spaces.workspaceId, docs.id)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-17-list-hides-own-space: applied")
