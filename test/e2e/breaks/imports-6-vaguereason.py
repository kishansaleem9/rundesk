# Check 6 — keep the refusal but drop the WHY: no column, no value, just 'could
# not be imported'. A person cannot act on it.
#
# Reddens: imports: "and names the file line and the reason for each refusal"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = '          message: `Row ${line}: "${cell.value}" in ${cell.header} is not a date.`,'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '          message: `Row ${line}: this row could not be imported.`,'))
print('BROKE check 6: a bad date is refused without naming the column or the value')
