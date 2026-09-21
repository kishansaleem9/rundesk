# Check 7 — import the first row of each list and stop. The job still reports
# success; the list is half of what the file held. (Also fails check 10, which
# needs the second task to exist.)
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        for (const r of listRows) {'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '        for (const r of listRows.slice(0, 1)) {'))
print('BROKE check 7: only the first row of each list is imported')
