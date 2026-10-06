# A ROW THE DATABASE REFUSES ENDS THE RUN (`found-5-oct/xlsx-read-as-text`): its error is thrown rather than reported, so the run fails
# with the rows before it taken away and none after it imported. (The row holding a NUL goes red with it.)
# Reddens: imports: "a row the database refuses fails alone: the job completes with the rows around it imported and that row’s error reported"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '            summary.errors.push(`Row ${r.row} ("${r.title}"): ${e?.message ?? \'unknown error\'}`)\n'
b = '            throw e\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-33-a-refused-row-aborts-the-run: a refused row ends the run')
