# THE PAGE ASKS A FILE NOTHING OF ITS NAME (`found-5-oct/xlsx-read-as-text`): a PDF is read as text.
# RE-AIMED (batch 38, `ledger-rows/row-816`): the page no longer refuses a workbook —
# it uploads one (`sheetFileKind`: 'text', 'file' or null) — so the mutation is
# the same question asked wrongly where the answer is now given.
# Reddens: unit: apps/web/src/lib/sheet-file.test.ts "a file of no kind the import reads is refused by its name, whatever it holds"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (!accepted.some((ext) => name.endsWith(ext.toLowerCase()))) return null\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sfl-1-any-name-is-a-sheet-unit: the page asks a file nothing of its name')
