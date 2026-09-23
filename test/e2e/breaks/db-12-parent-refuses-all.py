# A PARENT RULE THAT REFUSES EVERY DOC: no sub-page can be made at all.
# Reddens: doc-boundaries: "while one is created under a doc of its own workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (!parent || parent.workspaceId !== workspaceId) throw new NotFoundException('Parent doc not found')\n"
b = "    throw new NotFoundException('Parent doc not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-12-parent-refuses-all: applied")
