# THE PAGE READS A FILE WHATEVER IT IS CALLED (`found-5-oct/xlsx-read-as-text`): a PDF chosen anyway is
# taken, read as text and offered for preview.
# RE-AIMED (batch 38, `ledger-rows/row-816`): the page no longer refuses a workbook —
# it uploads one (`sheetFileKind`: 'text', 'file' or null) — so the mutation is
# the same question asked wrongly where the answer is now given.
# Reddens: importers: "a PDF is refused by its name in the words under the picker — the six kinds read — and nothing is uploaded or kept"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (!accepted.some((ext) => name.endsWith(ext.toLowerCase()))) return null\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-29-page-reads-any-name: the page asks a file nothing of its name')
