# THE PAGE READS A ZIP AS TEXT WHEN IT IS CALLED .csv (`found-5-oct/xlsx-read-as-text`): an .xlsx renamed .csv
# is read by the page and its bytes sent as text, which the server refuses.
# RE-AIMED (batch 38, `ledger-rows/row-816`): the page no longer refuses a workbook —
# it uploads one (`sheetFileKind`: 'text', 'file' or null) — so the mutation is
# the same question asked wrongly where the answer is now given.
# Reddens: imports: "an .xlsx renamed .csv is known by its first bytes and read as the workbook it is — uploaded, its key sent, never its bytes as text"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (isZipSignature(head) || isCompoundFileSignature(head)) return 'file'\n"
b = "  if (isCompoundFileSignature(head)) return 'file'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-30-page-reads-any-bytes: the page asks a file nothing of a zip's first bytes")
