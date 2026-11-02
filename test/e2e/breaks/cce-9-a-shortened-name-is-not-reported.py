# A NAME SHORTENED IN SILENCE: the note on that row never reaches the report.
# Reddens: clickup-current-export: "the 600-character name is imported under its first 500, and the report says so"
import io
p = '/home/user/rundesk/packages/imports/src/spreadsheet-adapter.ts'
a = "      if (i.severity === 'info') report.warnings.push({ ref, column: i.column, message: i.message })"
b = "      if (i.severity === 'info' && i.column !== 'taskName') report.warnings.push({ ref, column: i.column, message: i.message })"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-9-a-shortened-name-is-not-reported: applied")
