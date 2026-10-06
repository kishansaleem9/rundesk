# A ROW THE DATABASE REFUSES ENDS THE RUN (`found-5-oct/xlsx-read-as-text`): its error is thrown rather than reported, so the run fails
# with the rows before it taken away and none after it imported. (The row holding a NUL goes red with it.)
# RE-AIMED 6 October (the review fix): every check whose run has a refused row goes red with it — the merges the write
# rule refuses, and the assignee at Comment's refused priority (measured 49/53).
# Reddens: imports:
#   "a row the database refuses fails alone: the job completes with the rows around it imported and that row’s error reported"
#   "a row holding a NUL fails alone: the job completes with the rows around it imported, and that row’s error is reported without the NUL"
#   "a merge by a member granted workspace.import changes only the task they may change — both importers, with a space named and without: a view-only space’s task and a task of a project they are at View on stay as they were, each row refused in the write rule’s words"
#   "a merge by a member granted workspace.import into a task assigned to them in a space at Comment writes a status alone, and refuses a priority or a description in the write rule’s words, leaving the task as it was — both importers"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '            summary.errors.push(`Row ${r.row} ("${r.title}"): ${e?.message ?? \'unknown error\'}`)\n'
b = '            throw e\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-33-a-refused-row-aborts-the-run: a refused row ends the run')
