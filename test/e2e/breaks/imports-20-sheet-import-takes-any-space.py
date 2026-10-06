# THE SPREADSHEET IMPORT PUTS ITS PROJECT IN ANY SPACE IT IS GIVEN (`found-5-oct/import-writes-into-another-workspace`):
# its start asks nothing of `targetSpaceId`, so a stranger writes into another workspace's space. (Its view-only and
# private halves of the two checks after it go red too: the gate is not asked at all.)
# Reddens: imports: "the spreadsheet import refuses a space of another workspace, 403 “That space is not in this workspace”, and one naming nothing 404 — writing nothing there, not even a job row"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (dto.targetSpaceId) await assertImportTarget(this.db, { workspaceId, spaceId: dto.targetSpaceId, actorId: userId })\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-20-sheet-import-takes-any-space: the spreadsheet import asks nothing of its target space")
