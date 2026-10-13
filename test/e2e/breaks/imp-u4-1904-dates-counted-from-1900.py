# A WORKBOOK IN EXCEL'S 1904 SYSTEM IS READ IN THE 1900 ONE: every date four years early —
# the flag is read as a word Excel never writes.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: xlsx-read.test.ts "reads the first sheet that is not hidden, and counts dates from 1904 when the workbook says so"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/xlsx-read.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      date1904 = v === '1' || v === 'true'\n",
     "      date1904 = v === 'yes'\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u4-1904-dates-counted-from-1900: date1904 is never set')
