# Check 5 — count the rows that will be REFUSED as rows that will be imported, so
# the preview promises four and delivers two.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      importableRows: rows.length,'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '      importableRows: table.rows.length,'))
print('BROKE check 5: the preview counts rejected rows as importable')
