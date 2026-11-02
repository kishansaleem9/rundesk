# A NAME OVER 500 CHARACTERS REFUSES ITS ROW, as before: one task of the export is not imported.
# Reddens: clickup-current-export: "every row of the export is imported, and none is refused"
import io
p = '/home/user/rundesk/packages/imports/src/grid.ts'
a = "          severity: 'info',\n          message: `Task Name is ${name.length} characters, so it was shortened"
b = "          severity: 'invalid',\n          message: `Task Name is ${name.length} characters, so it was shortened"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-3-a-long-name-refuses-its-row: applied")
