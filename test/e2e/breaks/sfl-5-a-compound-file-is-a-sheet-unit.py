# THE PAGE KNOWS A ZIP AND NOTHING ELSE BY ITS FIRST BYTES (`found-5-oct/xlsx-read-as-text`): a legacy .xls
# renamed .csv is read as text.
# RE-AIMED (batch 38, `ledger-rows/row-816`): the page no longer refuses a workbook —
# it uploads one (`sheetFileKind`: 'text', 'file' or null) — so the mutation is
# the same question asked wrongly where the answer is now given.
# Reddens: unit: sheet-file.test.ts "a legacy .xls under a CSV or text name is uploaded by its first bytes — the compound file’s eight"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (isZipSignature(head) || isCompoundFileSignature(head)) return 'file'\n"
b = "  if (isZipSignature(head)) return 'file'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sfl-5-a-compound-file-is-a-sheet-unit: the page reads a compound file as text')
