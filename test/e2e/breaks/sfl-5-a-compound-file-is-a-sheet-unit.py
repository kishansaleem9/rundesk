# THE PAGE KNOWS A ZIP AND NOTHING ELSE BY ITS FIRST BYTES (`found-5-oct/xlsx-read-as-text`): a legacy .xls renamed .csv is a sheet.
# Reddens: unit: sheet-file.test.ts "a legacy .xls named .csv is refused by its first bytes too — the compound file’s eight"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = '  return !isZipSignature(head) && !isCompoundFileSignature(head)\n'
b = '  return !isZipSignature(head)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sfl-5-a-compound-file-is-a-sheet-unit: the page reads a compound file as a sheet')
