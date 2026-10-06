# "PK" ALONE IS TAKEN FOR A ZIP (`found-5-oct/xlsx-read-as-text`): a sheet whose first column is "PK" is refused as one.
# Reddens: unit: spreadsheet-import.util.test.ts "is a zip by its first bytes — and a sheet whose first column is “PK” is not one"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (head.length < 4 || !head.startsWith('PK')) return false\n"
b = "  if (head.startsWith('PK')) return true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("isu-1-pk-alone-is-a-zip-unit: a zip is told by \"PK\" alone")
