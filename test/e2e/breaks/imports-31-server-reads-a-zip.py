# THE SERVER READS A ZIP AS DELIMITED TEXT (`found-5-oct/xlsx-read-as-text`): the routes ask the content nothing, so preview draws an
# .xlsx's bytes as a column and the import runs on them. (Both tests go: an .xlsx's first line holds a NUL too.)
# Reddens: imports: "the server refuses an .xlsx’s bytes sent as text — preview and import answer 400, saying to send the file itself — and makes nothing: no job row, no space"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (isZipContent(content)) throw new BadRequestException(NOT_DELIMITED_TEXT)\n    if (headerHoldsNul(content)) throw new BadRequestException(NOT_DELIMITED_TEXT)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-31-server-reads-a-zip: the spreadsheet routes read any content as text')
