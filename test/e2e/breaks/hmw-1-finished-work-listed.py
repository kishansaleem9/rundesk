# FINISHED WORK IS LISTED AGAIN, as it was: every closed task with a past due date is counted overdue.
# Reddens: home-my-work: "nothing finished, whatever its closed status is called, and nothing in the Trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "          or(isNull(tasks.statusCategory), sql`${tasks.statusCategory} <> 'closed'`),\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-1-finished-work-listed: applied")
