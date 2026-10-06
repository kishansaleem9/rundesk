# THE CLICKUP PREVIEW ASKS NO GUEST RULE (`found-6-oct/a-guest-who-may-import-makes-a-space`): a guest granted workspace.import is answered 201.
# Reddens: imports: "a guest granted workspace.import by a custom role is refused both previews, both imports and the ClickUp enrichment, 403 “Guests cannot import data into a workspace” — and no space, task or job row of theirs is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.access.assertMayImport(this.db, { workspaceId, actorId: importer.id })\n    const { rows, customFieldColumns } = parseClickUpCsv(dto.csv ?? '')\n"
b = "    const { rows, customFieldColumns } = parseClickUpCsv(dto.csv ?? '')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-62-clickup-preview-lets-a-guest-in: the ClickUp preview skips the guest rule')
