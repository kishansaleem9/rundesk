# THE CLICKUP IMPORT PUTS ITS PROJECT IN ANY SPACE IT IS GIVEN (`found-5-oct/import-writes-into-another-workspace`).
# (The ClickUp halves of the view-only and private checks go red too.)
# Reddens: imports: "the ClickUp import refuses a space of another workspace, 403 “That space is not in this workspace”, and one naming nothing 404 — writing nothing there, not even a job row"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (dto.targetSpaceId) await assertImportTarget(this.db, { workspaceId, spaceId: dto.targetSpaceId, actorId: userId })\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-21-clickup-import-takes-any-space: the ClickUp import asks nothing of its target space")
