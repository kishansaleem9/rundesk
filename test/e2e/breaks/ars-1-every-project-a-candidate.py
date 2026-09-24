# SUGGESTIONS LEARN FROM EVERY PROJECT OF THE WORKSPACE, as they did: a private space's steps handed to anyone.
# Reddens: ai-read-access: "a member’s suggestions carry no title or name from a space or a list they are refused — the admin’s carry both"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '      .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(this.db, reader.id, isManager)))\n      .orderBy(desc(projects.createdAt))\n      .limit(60)\n'
b = '      .where(eq(spaces.workspaceId, workspaceId))\n      .orderBy(desc(projects.createdAt))\n      .limit(60)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ars-1-every-project-a-candidate: applied")
