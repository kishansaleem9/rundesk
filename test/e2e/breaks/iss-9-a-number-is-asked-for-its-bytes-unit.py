# CONTENT THAT IS NOT A STRING IS ASKED FOR ITS FIRST BYTES (`found-5-oct/xlsx-read-as-text`): the preview throws a TypeError.
# Reddens: unit: spreadsheet-import.service.test.ts "a preview of content that is no text at all answers 400 “The file has no header row.”, as it did — not a TypeError"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (typeof content !== 'string') return false\n  const head = content\n  if (head.length < 4 || !head.startsWith('PK')) return false\n"
b = "  const head = content as string\n  if (head.length < 4 || !head.startsWith('PK')) return false\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iss-9-a-number-is-asked-for-its-bytes-unit: a number is read as a string')
