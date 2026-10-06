# A SPREADSHEET IMPORT'S REPORT ASKS NO KEY: any member or guest reads its errors. (`found-6-oct/import-history-read-by-anyone`)
# Reddens: imports: "the import history and each import’s report are asked what the imports ask: a member and a guest without workspace.import are refused both, 403 “Missing required permission: workspace.import”, and a guest granted it “Guests cannot import data into a workspace”, while a member granted it reads the history and the admin’s reports"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Get('jobs/:jobId')\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('workspace.import')\n"
b = "  @Get('jobs/:jobId')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-64-a-sheet-report-asks-no-key: a spreadsheet import's report asks nothing of its reader")
