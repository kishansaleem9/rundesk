# A GUEST READS A CLICKUP IMPORT'S REPORT: the report skips the guest rule. (`found-6-oct/import-history-read-by-anyone`)
# Reddens: unit: clickup-import.service.test.ts "a guest is refused a job’s report, 403 “Guests cannot import data into a workspace”, before the job is read; a member reads it (found-6-oct/import-history-read-by-anyone)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '  async readJob(workspaceId: string, jobId: string, reader: Importer) {\n    await this.access.assertMayImport(this.db, { workspaceId, actorId: reader.id })\n'
b = '  async readJob(workspaceId: string, jobId: string, reader: Importer) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("ics-11-a-guest-reads-a-clickup-report-unit: a ClickUp import's report skips the guest rule")
