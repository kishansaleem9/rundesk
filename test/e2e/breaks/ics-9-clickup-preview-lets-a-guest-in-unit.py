# THE CLICKUP PREVIEW ASKS NO GUEST RULE (`found-6-oct/a-guest-who-may-import-makes-a-space`).
# RE-AIMED 6 October: the preview asks whether its body is text before it parses it (`found-6-oct/import-start-answers-500-to-non-text`); the mistake is the same.
# Reddens: unit: clickup-import.service.test.ts "a guest is refused the preview, the import and the enrichment, 403 “Guests cannot import data into a workspace”, before anything is read or written (found-6-oct/a-guest-who-may-import-makes-a-space)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.access.assertMayImport(this.db, { workspaceId, actorId: importer.id })\n    // A body that is no text is no CSV"
b = "    // A body that is no text is no CSV"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ics-9-clickup-preview-lets-a-guest-in-unit: the ClickUp preview skips the guest rule')
