# THE PAGE READS A FILE WHATEVER IT IS CALLED (`found-5-oct/xlsx-read-as-text`): an .xls, which is no zip, is taken and
# offered for preview. (An .xlsx is still refused, by its first bytes.)
# Reddens: imports: "an .xlsx or .xls chosen anyway is refused by its name, in the words under the picker, and nothing is offered: no file kept, no Preview"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (!accepted.some((ext) => name.endsWith(ext.toLowerCase()))) return false\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-29-page-reads-any-name: the page asks a file nothing of its name")
