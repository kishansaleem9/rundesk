# A RUN THAT FAILS TAKES NOTHING AWAY (`found-5-oct/xlsx-read-as-text`): what it made before its last write was refused stays.
# Reddens: unit: spreadsheet-import.service.test.ts "a run whose last write is refused takes away what it made — its project, its space and the tags it made — and its job is marked failed, having created nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      const left = await this.undoRun(made)\n'
b = '      const left = await this.undoRun({ labelIds: [] })\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iss-4-a-failed-run-keeps-what-it-made-unit: a run that fails takes nothing away')
