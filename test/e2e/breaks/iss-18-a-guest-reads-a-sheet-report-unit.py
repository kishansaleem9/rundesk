# A GUEST READS A SPREADSHEET IMPORT'S REPORT: the report skips the guest rule. (`found-6-oct/import-history-read-by-anyone`)
# Reddens: unit: spreadsheet-import.service.test.ts "a guest is refused the history and a job’s report, 403 “Guests cannot import data into a workspace”, before any job is read; a member reads them (found-6-oct/import-history-read-by-anyone)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '  async readJob(workspaceId: string, jobId: string, reader: Importer) {\n    await this.access.assertMayImport(this.db, { workspaceId, actorId: reader.id })\n'
b = '  async readJob(workspaceId: string, jobId: string, reader: Importer) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("iss-18-a-guest-reads-a-sheet-report-unit: a spreadsheet import's report skips the guest rule")
