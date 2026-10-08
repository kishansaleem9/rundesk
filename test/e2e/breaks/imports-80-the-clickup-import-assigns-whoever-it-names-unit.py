# THE CLICKUP IMPORT PUTS ON A TASK WHOEVER A ROW NAMES, READ FROM ITS UNIT TEST (`found-6-oct/import-assigns-people-who-cannot-see-the-task`).
#
# Reddens: unit: clickup-import.service.test.ts "a person the assignee route would refuse is not put on the task, and the run says who and why"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = "      if (!(await this.access.mayBeAssigned(this.db, { workspaceId, taskId, userId: uid }))) {\n"
b = "      if (!(await this.access.mayBeAssigned(this.db, { workspaceId, taskId, userId: uid })) && false) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-80-the-clickup-import-assigns-whoever-it-names-unit: the ClickUp import links whom the rule refuses')
