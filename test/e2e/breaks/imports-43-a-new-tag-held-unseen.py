# A TAG THE IMPORT MAKES STAYS UNSEEN WHILE THE RUN GOES ON (`found-30-sep/spreadsheet-import-skips-task-rules`): it is not committed for 8 s, as it was not
# until the end of a run written as one transaction, so the tags route makes the same tag in another case beside it.
# Reddens: imports: "a tag a running import has made is the one the tags route finds, whatever its case, while the import is still running — no second tag beside it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      tally.labelKeys.push(key)\n      tally.labelIds.push(id)\n    }\n'
b = '      tally.labelKeys.push(key)\n      tally.labelIds.push(id)\n      await new Promise((resolve) => setTimeout(resolve, 8000))\n    }\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-43-a-new-tag-held-unseen: a tag the import makes is not committed with its row')
