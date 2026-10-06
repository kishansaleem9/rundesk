# A GUEST GRANTED THE KEY STARTS A CLICKUP IMPORT (`found-6-oct/a-guest-who-may-import-makes-a-space`): naming no space,
# it makes a public space holding their project and tasks.
# RE-AIMED 6 October: the start asks whether its body is text before it trims it (`found-6-oct/import-start-answers-500-to-non-text`); the mistake is the same.
# Reddens: imports: "a guest granted workspace.import by a custom role is refused both previews, both imports and the ClickUp enrichment, 403 “Guests cannot import data into a workspace” — and no space, task or job row of theirs is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.access.assertMayImport(this.db, { workspaceId, actorId: userId })\n    if (typeof dto.csv !== 'string')"
b = "    if (typeof dto.csv !== 'string')"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-53-a-guest-imports-from-clickup: the ClickUp import does not refuse a guest')
