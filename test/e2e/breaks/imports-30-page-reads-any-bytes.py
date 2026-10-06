# THE PAGE READS A ZIP WHATEVER IT IS CALLED (`found-5-oct/xlsx-read-as-text`): an .xlsx renamed .csv is taken, offered,
# and its zip sent to the server for a preview.
# Reddens: imports: "an .xlsx renamed .csv is refused by its first bytes, the same way, and no preview is asked of the server"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = "  return !isZipSignature(head) && !isCompoundFileSignature(head)\n"
b = "  return !isCompoundFileSignature(head)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-30-page-reads-any-bytes: the page asks a file nothing of its first bytes")
