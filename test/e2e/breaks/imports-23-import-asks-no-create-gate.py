# AN IMPORT ASKS NOTHING OF WHERE IT MAKES ITS PROJECT (`found-5-oct/import-writes-into-another-workspace`): a member granted
# workspace.import imports into a view-only space. (The private-space check after it goes red too.)
# Reddens: imports: "a member granted workspace.import cannot import into a view-only space — both importers refuse in the space’s words and write nothing there — while an import into the open space beside it goes through"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = "  await place(db, { spaceId: space.id, actorId: params.actorId, kind: 'project' })\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-23-import-asks-no-create-gate: an import asks no create gate")
