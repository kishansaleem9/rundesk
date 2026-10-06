# A ROW THE DATABASE REFUSES ENDS THE RUN (`found-5-oct/xlsx-read-as-text`): its error is thrown rather than reported.
# Reddens: unit: spreadsheet-import.service.test.ts "a row the database refuses fails alone: it is reported, and the rest of the file is written"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '            summary.errors.push(`Row ${r.row} ("${r.title}"): ${e?.message ?? \'unknown error\'}`)\n'
b = '            throw e\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iss-5-a-refused-row-ends-the-run-unit: a refused row ends the run')
