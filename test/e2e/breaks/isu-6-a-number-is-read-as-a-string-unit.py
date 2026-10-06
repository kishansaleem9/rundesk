# CONTENT THAT IS NOT A STRING IS ASKED FOR ITS FIRST BYTES (`found-5-oct/xlsx-read-as-text`): a number throws a TypeError.
# Reddens: unit: spreadsheet-import.util.test.ts "is no zip when it is not a string at all — a number or an object from a client goes on to the parser"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (typeof content !== 'string') return false\n  const head = content\n  if (head.length < 4 || !head.startsWith('PK')) return false\n"
b = "  const head = content as string\n  if (head.length < 4 || !head.startsWith('PK')) return false\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isu-6-a-number-is-read-as-a-string-unit: a number is read as a string')
