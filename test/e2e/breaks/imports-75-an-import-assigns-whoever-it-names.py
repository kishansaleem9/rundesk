# AN IMPORT PUTS ON A TASK WHOEVER A ROW NAMES (`found-6-oct/import-assigns-people-who-cannot-see-the-task`).
#
# Both importers ask the assignee rule (`mayBeAssigned`) of each person a row
# names. Let it answer yes to anyone with an account, as nothing asked
# before, and a guest nothing is shared with is put on a spreadsheet merge's
# task, a new row's and a ClickUp merge's, and no run says why.
#
# Reddens: imports:
#   "an import puts nobody on a task the assignee route would refuse them: a guest named by a spreadsheet merge, a new row and a ClickUp merge is on none of them, and each run says who and why"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
a = "  if (!person) return false\n  return (await readableTask(db, p.workspaceId, p.taskId, { id: p.userId, role: person.role }, { asAssignee: true })) !== null\n"
b = "  if (!person) return false\n  return true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-75-an-import-assigns-whoever-it-names: the assignee rule answers yes to anyone')
