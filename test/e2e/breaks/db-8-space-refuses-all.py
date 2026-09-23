# A SPACE RULE THAT REFUSES EVERY SPACE: safe, and no doc can be filed anywhere.
# Reddens: doc-boundaries: "while one filed under a space it can reach is made there, and listed with that space’s name"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (!space || space.workspaceId !== workspaceId) throw new NotFoundException('Space not found')\n"
b = "    throw new NotFoundException('Space not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-8-space-refuses-all: applied")
