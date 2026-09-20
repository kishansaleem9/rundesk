# Check 15 — THE MIRROR OF THE FACADE. listJobs ignores its `source` parameter,
# so the column is written, stored, and honoured by nothing.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const where = opts.source\n      ? and(eq(clickupImportJobs.workspaceId, workspaceId), eq(clickupImportJobs.source, opts.source))\n      : eq(clickupImportJobs.workspaceId, workspaceId)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '    const where = eq(clickupImportJobs.workspaceId, workspaceId)'))
print('BROKE check 15: the job listing ignores ?source= entirely')
