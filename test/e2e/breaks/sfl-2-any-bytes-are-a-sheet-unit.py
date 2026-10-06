# THE PAGE ASKS A FILE NOTHING OF A ZIP'S FIRST BYTES (`found-5-oct/xlsx-read-as-text`).
# Reddens: unit: sheet-file.test.ts "a zip named .csv is refused by its first bytes"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = "  return !isZipSignature(head) && !isCompoundFileSignature(head)\n"
b = "  return !isCompoundFileSignature(head)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("sfl-2-any-bytes-are-a-sheet-unit: the page asks a file nothing of its first bytes")
