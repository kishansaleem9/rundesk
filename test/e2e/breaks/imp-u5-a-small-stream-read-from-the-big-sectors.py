# A LEGACY .xls's SMALL WORKBOOK STREAM IS READ FROM THE REGULAR SECTORS, not the mini stream.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: xls-read.test.ts "and from a small stream kept in the mini stream"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/xls-read.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (book.size >= miniCutoff || !root) return readChain(book.start, book.size)\n',
     '  if (book.size >= 0 || !root) return readChain(book.start, book.size)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u5-a-small-stream-read-from-the-big-sectors: the mini stream is never read')
