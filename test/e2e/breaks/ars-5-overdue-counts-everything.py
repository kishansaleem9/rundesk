# ASSIGN WITH AI COUNTS A COLLEAGUE'S OVERDUE WORK WHEREVER IT IS.
# Reddens: ai-read-access: "Assign with AI, asked by a member, counts a colleague’s open and overdue work as the member may see it — asked by the admin, it counts all of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '            lt(tasks.dueDate, overdueBefore()),\n            actorSees,\n'
b = '            lt(tasks.dueDate, overdueBefore()),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ars-5-overdue-counts-everything: applied")
