# THE PAGE SENDS A WORKBOOK'S BYTES AS TEXT: an .xlsx chosen as one is read by the page,
# and the server refuses what it is sent.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "the workbook is uploaded as it is and read from its sheet — the page says which — and Monday’s columns map: Name, Status, Date and Person, and each item’s group as its list"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  return UPLOADED.some((ext) => name.endsWith(ext)) ? 'file' : 'text'\n",
     "  return 'text'\n"),
    ("  if (isZipSignature(head) || isCompoundFileSignature(head)) return 'file'\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-16-a-workbook-sent-as-text: the page reads every sheet file as text')
