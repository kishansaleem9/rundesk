# THE PAGE READS A FILE'S NAME IN ITS OWN CASE (`found-5-oct/xlsx-read-as-text`): a "keys.CSV" is refused as not a sheet.
# Reddens: unit: sheet-file.test.ts "delimited text is read, a first column named “PK” among it"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = "  const name = file.name.toLowerCase()\n"
b = "  const name = file.name\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("sfl-3-a-name-in-capitals-is-refused-unit: the page reads a file name case by case")
