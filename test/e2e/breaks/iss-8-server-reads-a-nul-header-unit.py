# THE SPREADSHEET ROUTES ASK ONLY WHETHER CONTENT IS A ZIP (`found-5-oct/xlsx-read-as-text`): a legacy .xls read as text is taken.
# Reddens: unit: spreadsheet-import.service.test.ts "a legacy .xls read as text — a NUL in its first line — is refused the same way, at the start and at the preview"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (headerHoldsNul(content)) throw new BadRequestException(NOT_DELIMITED_TEXT)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iss-8-server-reads-a-nul-header-unit: the spreadsheet routes read a NUL-headed file as text')
