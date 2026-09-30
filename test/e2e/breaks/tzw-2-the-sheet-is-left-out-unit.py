# THE SHEET IS LEFT OUT OF THE WORKBOOK (`found-30-sep/two-zip-writers`): the parts handed to the zip writer
# stop at the workbook's relationships, so the archive is whole and names a worksheet it does not hold, and
# Excel refuses the file.
# Reddens: unit: xlsx.test.ts "writes the five parts a reader opens, every CRC right, the cells as inline strings"
import io
p = '/home/user/rundesk/apps/api/src/common/export/xlsx.ts'
a = "    ['xl/worksheets/sheet1.xml', sheetXml(headers, rows)],\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tzw-2-the-sheet-is-left-out-unit: the worksheet part is not written')
