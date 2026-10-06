# A GUEST GRANTED THE KEY IMPORTS COMMENTS AND FILES INTO A CLICKUP IMPORT (`found-6-oct/a-guest-who-may-import-makes-a-space`).
# Reddens: unit: clickup-import.service.test.ts "a guest is refused the preview, the import and the enrichment, 403 “Guests cannot import data into a workspace”, before anything is read or written (found-6-oct/a-guest-who-may-import-makes-a-space)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await this.access.assertMayImport(this.db, { workspaceId, actorId: userId })\n    const job = await this.getJob(workspaceId, jobId)\n'
b = '    const job = await this.getJob(workspaceId, jobId)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ics-5-a-guest-enriches-a-clickup-import-unit: the ClickUp enrichment does not refuse a guest')
