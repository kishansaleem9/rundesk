# CONTENT THAT IS NOT A STRING GOES ON PAST THE TEXT CHECK (`found-5-oct/xlsx-read-as-text`,
# `found-6-oct/import-start-answers-500-to-non-text`): the start's `.trim()` of a number throws, a 500.
# RE-AIMED 6 October: the string guard is the route's own now (`assertDelimitedText`), not `isZipContent`'s;
# its check is the four routes' (it was the preview's "The file has no header row.").
# Reddens: imports: "a body that is no text — a number, an object or true — is refused 400 in the page’s words by both previews and both starts, and no job is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
a = "    if (typeof content !== 'string') throw new BadRequestException(NOT_DELIMITED_TEXT)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-39-a-number-is-asked-for-its-bytes: content that is not a string goes on')
