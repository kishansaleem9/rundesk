# THE CLICKUP IMPORT'S START ASKS NOTHING OF ITS TARGET SPACE (`found-5-oct/import-writes-into-another-workspace`).
# Reddens: unit: clickup-import.service.test.ts "a space of another workspace is refused 403, and no job row is written"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (dto.targetSpaceId) await assertImportTarget(this.db, { workspaceId, spaceId: dto.targetSpaceId, actorId: userId })\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("ics-1-clickup-start-takes-any-space-unit: the ClickUp import asks nothing of its target space")
