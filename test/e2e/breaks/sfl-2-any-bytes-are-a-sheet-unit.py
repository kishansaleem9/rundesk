# THE PAGE ASKS A FILE NOTHING OF A ZIP'S FIRST BYTES (`found-5-oct/xlsx-read-as-text`): a workbook named
# .csv is read as text.
# RE-AIMED (batch 38, `ledger-rows/row-816`): the page no longer refuses a workbook —
# it uploads one (`sheetFileKind`: 'text', 'file' or null) — so the mutation is
# the same question asked wrongly where the answer is now given.
# Reddens: unit: sheet-file.test.ts "a workbook under a CSV name is uploaded and read as the workbook, by its first bytes"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (isZipSignature(head) || isCompoundFileSignature(head)) return 'file'\n"
b = "  if (isCompoundFileSignature(head)) return 'file'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("sfl-2-any-bytes-are-a-sheet-unit: the page asks a file nothing of a zip's first bytes")
