# Check 19 — the neighbouring importer. Break the ClickUp preview's row count, to
# prove the regression check is reading something real.
#
# Reddens: imports: "preview still answers with its row count"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      totalRows: rows.length,'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '      totalRows: 0,'))
print('BROKE check 19: the ClickUp preview always reports 0 rows')
