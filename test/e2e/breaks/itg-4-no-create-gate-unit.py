# THE TARGET SPACE IS NOT PUT TO THE CREATE GATE (`found-5-oct/import-writes-into-another-workspace`).
# Reddens: unit: import-target.test.ts "a space of this workspace is put to the create gate, for the project the import makes there"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = "  await place(db, { spaceId: space.id, actorId: params.actorId, kind: 'project' })\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("itg-4-no-create-gate-unit: the create gate is not asked")
