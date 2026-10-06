# THE CREATE GATE IS ASKED AND ITS REFUSAL SWALLOWED (`found-5-oct/import-writes-into-another-workspace`).
# Reddens: unit: import-target.test.ts "and what the create gate refuses is the answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = "  await place(db, { spaceId: space.id, actorId: params.actorId, kind: 'project' })\n"
b = "  await place(db, { spaceId: space.id, actorId: params.actorId, kind: 'project' }).catch(() => undefined)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("itg-5-the-gate-is-asked-and-ignored-unit: the create gate's refusal is swallowed")
