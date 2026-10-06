# A GUEST GRANTED THE KEY READS A CLICKUP IMPORT'S REPORT: the report skips the guest rule. (`found-6-oct/import-history-read-by-anyone`)
# Reddens: imports: "the import history and each import’s report are asked what the imports ask: a member and a guest without workspace.import are refused both, 403 “Missing required permission: workspace.import”, and a guest granted it “Guests cannot import data into a workspace”, while a member granted it reads the history and the admin’s reports"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '  async readJob(workspaceId: string, jobId: string, reader: Importer) {\n    await this.access.assertMayImport(this.db, { workspaceId, actorId: reader.id })\n'
b = '  async readJob(workspaceId: string, jobId: string, reader: Importer) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-68-a-guest-reads-a-clickup-report: a ClickUp import's report skips the guest rule")
