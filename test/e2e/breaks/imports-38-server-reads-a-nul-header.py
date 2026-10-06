# THE SERVER ASKS A FILE ONLY WHETHER IT IS A ZIP (`found-5-oct/xlsx-read-as-text`): a legacy .xls read as text, its first line full of
# NULs, is previewed as columns of binary.
# Reddens: imports: "the server refuses a legacy .xls’s content too — a NUL in its first line — preview and import answering 400 in the page’s words, and makes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (headerHoldsNul(content)) throw new BadRequestException(NOT_DELIMITED_TEXT)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-38-server-reads-a-nul-header: the spreadsheet routes read a NUL-headed file as text')
