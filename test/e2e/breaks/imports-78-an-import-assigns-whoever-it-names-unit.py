# AN IMPORT PUTS ON A TASK WHOEVER A ROW NAMES, READ FROM ITS UNIT TEST (`found-6-oct/import-assigns-people-who-cannot-see-the-task`).
#
# Reddens: unit: spreadsheet-import.service.test.ts "a person the assignee route would refuse is not linked, on a merged row or a new one: counted unmatched, and the run says who and why"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
a = "      if (!(await this.access.mayBeAssigned(db as Db, { workspaceId, taskId, userId }))) {\n"
b = "      if (!(await this.access.mayBeAssigned(db as Db, { workspaceId, taskId, userId })) && false) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-78-an-import-assigns-whoever-it-names-unit: the spreadsheet import links whom the rule refuses')
