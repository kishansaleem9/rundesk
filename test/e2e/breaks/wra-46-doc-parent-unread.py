# A PAGE FILED UNDER ANY DOC OF THE WORKSPACE, as it was: one the author may not open included.
# Reddens: workspace-read-access: "and a member cannot hang a page under a doc they may not open, nor move one there (404) — while they add one under an open doc"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (!(await canReadDoc(this.db, parent, actorId, await resolveIsManager(this.db, workspaceId, actorId)))) {\n      throw new NotFoundException('Parent doc not found')\n    }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-46-doc-parent-unread: applied")
