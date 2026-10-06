# A FILE THAT IS NOT DELIMITED TEXT IS REFUSED IN WORDS THE PAGE DOES NOT USE (`found-5-oct/xlsx-read-as-text`).
# Reddens: unit: spreadsheet-import.util.test.ts "is refused in the words the page shows under its picker"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = ".xlsx is not read — re-save the sheet as CSV first.`"
b = "only delimited text is read.`"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("isu-2-refused-in-other-words-unit: the refusal says other words")
