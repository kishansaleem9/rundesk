# CONTENT THAT IS NOT A STRING GOES ON PAST THE TEXT CHECK (`found-5-oct/xlsx-read-as-text`).
# RE-AIMED 6 October: the string guard is the route's own now (`assertDelimitedText`), and the test asks both routes.
# Reddens: unit: spreadsheet-import.service.test.ts "a preview or an import of content that is no text at all answers 400 in the page’s words — not a TypeError"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
a = "    if (typeof content !== 'string') throw new BadRequestException(NOT_DELIMITED_TEXT)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('iss-9-a-number-is-asked-for-its-bytes-unit: content that is not a string goes on')
